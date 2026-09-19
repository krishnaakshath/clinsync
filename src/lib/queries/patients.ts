import { getDb } from '@/db/client'
import { patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes, allergies, identityVerifications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, patientListCacheKey, patientDetailCacheKey } from '@/lib/cache'
import { listDiscrepanciesForPatient } from '@/lib/queries/discrepancies'
import type { Verdict } from '@/lib/rule-engine'

export interface CriteriaSummary {
  inclusionMet: number
  inclusionTotal: number
  exclusionMet: number
  exclusionTotal: number
}

export type PatientWithStatus = typeof patients.$inferSelect & { trialId?: string; overallStatus?: Verdict; criteriaSummary?: CriteriaSummary }

/**
 * Shared by the /api/patients route handler and any Server Component that
 * needs this data. Server Components must call this directly rather than
 * `fetch()`-ing the app's own API route — a prior review found that pattern
 * (deriving the outbound fetch's origin from the incoming, client-controlled
 * Host header) let an attacker exfiltrate a live session cookie via a forged
 * Host header. Calling the query directly needs no outbound HTTP request at
 * all, which removes that vulnerability class entirely (and matches Next.js's
 * own guidance: fetch data in Server Components from its source, not via
 * Route Handlers).
 */
export async function listPatientsWithStatus(trialId: string | null): Promise<PatientWithStatus[]> {
  return getOrSetCache(patientListCacheKey(trialId), 30, async () => {
    const rows = await getDb()
      .select({ patient: patients, screening: patientTrialScreenings })
      .from(patients)
      .leftJoin(patientTrialScreenings, eq(patientTrialScreenings.patientId, patients.id))
      .where(trialId ? eq(patientTrialScreenings.trialId, trialId) : undefined)
      .orderBy(patients.id)

    // Single grouped query for every screening's criteria results, joined
    // back to patientId, so the patient list/cards can show a lightweight
    // "N/M inclusion" readout without an N+1 per-patient criteria lookup.
    const criteriaRows = await getDb()
      .select({
        patientId: patientTrialScreenings.patientId,
        criterionType: screeningCriteriaResults.criterionType,
        verdict: screeningCriteriaResults.verdict,
      })
      .from(screeningCriteriaResults)
      .innerJoin(patientTrialScreenings, eq(screeningCriteriaResults.screeningId, patientTrialScreenings.id))

    const summaryByPatient = new Map<string, CriteriaSummary>()
    for (const row of criteriaRows) {
      const summary = summaryByPatient.get(row.patientId) ?? { inclusionMet: 0, inclusionTotal: 0, exclusionMet: 0, exclusionTotal: 0 }
      const met = row.verdict === 'green'
      // Null criterionType is legacy data written before the column existed
      // -- the UI (and this rollup) treats it the same as 'inclusion'.
      if (row.criterionType === 'exclusion') {
        summary.exclusionTotal += 1
        if (met) summary.exclusionMet += 1
      } else {
        summary.inclusionTotal += 1
        if (met) summary.inclusionMet += 1
      }
      summaryByPatient.set(row.patientId, summary)
    }

    return rows.map((r) => ({
      ...r.patient,
      trialId: r.screening?.trialId,
      overallStatus: r.screening?.overallStatus,
      criteriaSummary: summaryByPatient.get(r.patient.id),
    }))
  })
}

/**
 * Shared by the /api/patients/[anonId] route handler and the Patient Detail
 * Server Component page — see the comment on `listPatientsWithStatus` above
 * for why Server Components must call this directly rather than fetching
 * the app's own API route.
 */
export async function getPatientDetail(anonId: string) {
  return getOrSetCache(patientDetailCacheKey(anonId), 30, async () => {
    const [patient] = await getDb().select().from(patients).where(eq(patients.id, anonId))
    if (!patient) return null

    const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
    const criteria = screening ? await getDb().select().from(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screening.id)) : []
    const dx = await getDb().select().from(diagnoses).where(eq(diagnoses.patientId, anonId))
    const meds = await getDb().select().from(medicationEpisodes).where(eq(medicationEpisodes.patientId, anonId))
    const patientAllergies = await getDb().select().from(allergies).where(eq(allergies.patientId, anonId))
    // Project down to only what callers need. The full row includes
    // `idNumberEncrypted` (encrypted ciphertext of the ID number) and the
    // internal `id`/`patientId` keys -- never decrypted here, but there's no
    // reason to put ciphertext on the wire, in the Redis cache, or into the
    // Excel-export code path's intermediate objects when it's unused.
    const [identity] = await getDb()
      .select({
        idType: identityVerifications.idType,
        verified: identityVerifications.verified,
        verifiedBy: identityVerifications.verifiedBy,
        verifiedAt: identityVerifications.verifiedAt,
      })
      .from(identityVerifications)
      .where(eq(identityVerifications.patientId, anonId))

    const discrepancies = await listDiscrepanciesForPatient(anonId)

    return { ...patient, overallStatus: screening?.overallStatus, criteria, diagnoses: dx, medications: meds, allergies: patientAllergies, identityVerification: identity ?? null, portalConfigured: !!patient.portalPasswordHash, discrepancies }
  })
}

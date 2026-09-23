import { getDb } from '@/db/client'
import {
  patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes, allergies, identityVerifications,
  formSubmissions, formChartDiscrepancies, reviews, appointments, messages, charges, insuranceClaims, patientStatements, mockPayments, documents, faxes,
} from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, patientListCacheKey, patientDetailCacheKey, dashboardCacheKey, workbookListCacheKey } from '@/lib/cache'
import { listDiscrepanciesForPatient } from '@/lib/queries/discrepancies'
import type { Verdict } from '@/lib/rule-engine'

export interface CriteriaSummary {
  inclusionMet: number
  inclusionTotal: number
  exclusionMet: number
  exclusionTotal: number
}

// `mfaSecretEncrypted` is the patient's encrypted TOTP secret -- only the
// portal login/enrollment routes ever need it, and they read it through
// getPatientMfaState, never through these list/detail queries. Both queries
// below are serialized to JSON (GET /api/patients, GET /api/patients/[anonId],
// Server Component props) and written to the Redis cache, so the column is
// stripped from every row they return rather than riding along in a
// whole-row spread. `mfaEnabled` (a non-sensitive flag the staff UI shows)
// stays.
type PatientRowWithoutMfaSecret = Omit<typeof patients.$inferSelect, 'mfaSecretEncrypted'>

function withoutMfaSecret(row: typeof patients.$inferSelect): PatientRowWithoutMfaSecret {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mfaSecretEncrypted, ...rest } = row
  return rest
}

export type PatientWithStatus = PatientRowWithoutMfaSecret & { trialId?: string; overallStatus?: Verdict; criteriaSummary?: CriteriaSummary }

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
      ...withoutMfaSecret(r.patient),
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

    return { ...withoutMfaSecret(patient), mfaEnabled: patient.mfaEnabled, overallStatus: screening?.overallStatus, criteria, diagnoses: dx, medications: meds, allergies: patientAllergies, identityVerification: identity ?? null, portalConfigured: !!patient.portalPasswordHash, discrepancies }
  })
}

/**
 * Permanently removes a patient and every row that references it -- for
 * correcting a real mistake (a duplicate chart, a wrong entry), not a
 * routine action. None of these FKs cascade at the DB level (see
 * db/seed.ts's clearExistingData, which deletes in this same
 * children-before-parents order for the same reason), so each table is
 * cleared explicitly; Postgres would otherwise reject the final delete on
 * `patients` with a foreign-key violation. Returns false if the patient
 * doesn't exist, true once every row is gone.
 */
export async function deletePatient(anonId: string): Promise<boolean> {
  const db = getDb()
  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, anonId))
  if (!patient) return false

  const screenings = await db.select({ id: patientTrialScreenings.id, trialId: patientTrialScreenings.trialId }).from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  const screeningIds = screenings.map((s) => s.id)
  if (screeningIds.length > 0) {
    await db.delete(screeningCriteriaResults).where(inArray(screeningCriteriaResults.screeningId, screeningIds))
  }

  await db.delete(formChartDiscrepancies).where(eq(formChartDiscrepancies.patientId, anonId))
  await db.delete(reviews).where(eq(reviews.patientId, anonId))
  await db.delete(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  await db.delete(medicationEpisodes).where(eq(medicationEpisodes.patientId, anonId))
  await db.delete(diagnoses).where(eq(diagnoses.patientId, anonId))
  await db.delete(formSubmissions).where(eq(formSubmissions.patientId, anonId))
  await db.delete(allergies).where(eq(allergies.patientId, anonId))
  await db.delete(identityVerifications).where(eq(identityVerifications.patientId, anonId))
  await db.delete(appointments).where(eq(appointments.patientId, anonId))
  await db.delete(messages).where(eq(messages.patientId, anonId))
  await db.delete(insuranceClaims).where(eq(insuranceClaims.patientId, anonId))
  await db.delete(mockPayments).where(eq(mockPayments.patientId, anonId))
  await db.delete(patientStatements).where(eq(patientStatements.patientId, anonId))
  await db.delete(charges).where(eq(charges.patientId, anonId))
  await db.delete(documents).where(eq(documents.patientId, anonId))
  await db.delete(faxes).where(eq(faxes.patientId, anonId))
  await db.delete(patients).where(eq(patients.id, anonId))

  await invalidateCache(patientDetailCacheKey(anonId))
  await invalidateCache(patientListCacheKey(null))
  await invalidateCache(dashboardCacheKey())
  await invalidateCache(workbookListCacheKey())
  for (const s of screenings) {
    await invalidateCache(patientListCacheKey(s.trialId))
  }

  return true
}

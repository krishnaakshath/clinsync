import { getDb } from '@/db/client'
import { patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, patientListCacheKey, patientDetailCacheKey } from '@/lib/cache'
import type { Verdict } from '@/lib/rule-engine'

export type PatientWithStatus = typeof patients.$inferSelect & { trialId?: string; overallStatus?: Verdict }

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

    return rows.map((r) => ({ ...r.patient, trialId: r.screening?.trialId, overallStatus: r.screening?.overallStatus }))
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

    return { ...patient, overallStatus: screening?.overallStatus, criteria, diagnoses: dx, medications: meds }
  })
}

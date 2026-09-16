import { getDb } from '@/db/client'
import { patients, patientTrialScreenings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, patientListCacheKey } from '@/lib/cache'
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

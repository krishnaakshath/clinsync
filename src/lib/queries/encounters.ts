import { getDb } from '@/db/client'
import { encounters, providers, serviceLocations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { resolvePatientIdFromTebraId } from '@/lib/queries/appointments'
import type { AppointmentStatus } from '@/lib/queries/appointments'
import type { TebraEncounterDetail } from '@/connectors/types'

/**
 * Used by the Task 7 sync engine to check "already have this encounter"
 * before spending a `GetEncounterDetails` SOAP call on it.
 */
export async function getEncounterByTebraId(tebraId: string): Promise<{ id: number } | null> {
  const [row] = await getDb().select({ id: encounters.id }).from(encounters).where(eq(encounters.tebraId, tebraId))
  return row ?? null
}

/**
 * Upserts an encounter synced from Tebra, matched on `tebraId` -- inserts if
 * absent, updates if present.
 *
 * `encounters.tebraId` is `text(...).notNull()` with a PLAIN unique index
 * (no `source` column on this table -- it's Tebra-only reference/record
 * data, confirmed against `src/db/schema.ts`), so the bare
 * `target: [encounters.tebraId]` below is correct and sufficient -- no
 * `targetWhere`, unlike Task 5's `appointments`/`charges`/`providers`/
 * `insuranceClaims`, whose nullable `tebraId` needs a partial index and a
 * matching `targetWhere` predicate.
 *
 * Three raw-Tebra-id fields need resolving to Clinsync's own internal ids
 * before this can write a row:
 *
 * - `patientId`: resolved via `resolvePatientIdFromTebraId` (reused from
 *   `appointments.ts`, not reimplemented). If that Tebra patient hasn't
 *   been identity-matched into Clinsync yet, this cleanly no-ops (no throw,
 *   no insert/update) -- same reasoning as Task 5's appointment/charge
 *   patientId resolution: an unmatched patient is a routine, expected state
 *   under the existing human-gated identity-match workflow, not a bug.
 * - `providerId`: resolved via the same `providers.tebraId` lookup Task 5's
 *   appointments/charges use. Throws on no match -- providers are reference
 *   data synced daily, ahead of encounters, so a miss here is a real
 *   ordering bug, not a routine state (same reasoning Task 5 applied to
 *   appointment/charge providerId).
 * - `serviceLocationId`: resolved via a `serviceLocations.tebraId` lookup.
 *   Throws on no match for the same reason as providerId -- service
 *   locations are reference data synced ahead of entity data (Task 7's
 *   ordering assumption). Note `encounters.serviceLocationId` has no FK
 *   constraint declared in the schema (a pre-existing, already-reviewed
 *   gap) -- but the resolution still has to happen here regardless of
 *   whether the DB enforces it, since the column holds our internal serial
 *   int id, not Tebra's raw string id, and the two are not interchangeable.
 *
 * `status` is a plain `string` on `TebraEncounterDetail` (best-effort per
 * Task 3's connector notes) written into the existing
 * `appointmentStatusEnum` column -- cast the same way Task 5 casts
 * `TebraCharge.status`/`InsuranceClaimDetail.status` into their enum
 * columns, rather than adding new validation.
 */
export async function upsertEncounterFromTebra(data: TebraEncounterDetail): Promise<void> {
  const db = getDb()
  const patientId = await resolvePatientIdFromTebraId(db, data.patientId)
  if (!patientId) return // routine: this Tebra patient hasn't been identity-matched into Clinsync yet

  const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.tebraId, data.providerId))
  if (!provider) {
    throw new Error(`upsertEncounterFromTebra: no provider found for Tebra providerId "${data.providerId}" -- sync providers before encounters`)
  }

  const [serviceLocation] = await db
    .select({ id: serviceLocations.id })
    .from(serviceLocations)
    .where(eq(serviceLocations.tebraId, data.serviceLocationId))
  if (!serviceLocation) {
    throw new Error(
      `upsertEncounterFromTebra: no service location found for Tebra serviceLocationId "${data.serviceLocationId}" -- sync service locations before encounters`
    )
  }

  await db
    .insert(encounters)
    .values({
      tebraId: data.tebraId,
      patientId,
      providerId: provider.id,
      serviceLocationId: serviceLocation.id,
      serviceStartDate: data.serviceStartDate,
      serviceEndDate: data.serviceEndDate,
      status: data.status as AppointmentStatus,
    })
    .onConflictDoUpdate({
      target: [encounters.tebraId],
      set: {
        patientId,
        providerId: provider.id,
        serviceLocationId: serviceLocation.id,
        serviceStartDate: data.serviceStartDate,
        serviceEndDate: data.serviceEndDate,
        status: data.status as AppointmentStatus,
      },
    })
}

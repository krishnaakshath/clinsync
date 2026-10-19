import { getDb } from '@/db/client'
import { encounters, providers, serviceLocations } from '@/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { resolvePatientIdFromTebraId } from '@/lib/queries/appointments'
import type { AppointmentStatus } from '@/lib/queries/appointments'
import { mapAppointmentStatus } from '@/connectors/tebra.client'
import type { TebraEncounterDetail } from '@/connectors/types'

// Local copy of the normalization convention already established in
// src/lib/ehr-sync.ts for fuzzy name matching (`ehr-sync.ts` is a separate
// subsystem this sync engine has deliberately not depended on elsewhere --
// a 1-line local copy avoids introducing a new cross-dependency for this).
const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export interface CreateEncounterInput {
  patientId: string
  providerId: number
  serviceLocationId: number
  serviceStartDate: string
  serviceEndDate: string
  status: AppointmentStatus
}

/**
 * Native (clinsync-originated) encounter create -- mirrors
 * `createCharge`/`POST /api/appointments`'s insert shape. Explicit
 * `source: 'clinsync', tebraId: null` rather than relying on the schema's
 * defaults, so the native-create intent is visible in code (same reasoning
 * as the one-line additions to the appointments/charges insert call sites).
 */
export async function createEncounter(input: CreateEncounterInput) {
  const [created] = await getDb()
    .insert(encounters)
    .values({ ...input, source: 'clinsync', tebraId: null })
    .returning()
  return created
}

/**
 * Fetch one encounter by its internal serial id -- distinct from
 * `getEncounterByTebraId` above (which looks up by Tebra's id for the sync
 * engine's "already have this" check). Returns `null` if not found, same
 * convention as `getCharge`.
 */
export async function getEncounter(id: number) {
  const [row] = await getDb().select().from(encounters).where(eq(encounters.id, id))
  return row ?? null
}

export async function listEncounters() {
  return getDb().select().from(encounters).orderBy(desc(encounters.id))
}

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
 * `encounters.tebraId` is nullable with a PARTIAL unique index (corrected to
 * match appointments/charges/providers/insuranceClaims/documents -- native
 * encounter creation needed `source`/nullable `tebraId` too, per the design
 * spec's §4 "Native creates" list), so `onConflictDoUpdate` needs both
 * `target: [encounters.tebraId]` AND a matching `targetWhere` predicate, same
 * pattern as Task 5's upserts.
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
 *   appointments/charges use, FALLING BACK (Fix C2a) to a normalized
 *   (trim/collapse-whitespace/lowercase) name match against `providers.name`
 *   when that misses. Real Tebra data doesn't fit the original tebraId-only
 *   lookup here: `TebraEncounterDetail.providerId` is mapped from Tebra's
 *   `RenderingProvider` field, which is the provider's DISPLAY NAME, not a
 *   numeric Tebra provider id (see `mapEncounterDetail` in tebra.client.ts) --
 *   an exact-id lookup against `providers.tebraId` (which holds numeric Tebra
 *   ids) can never match it. If BOTH the tebraId lookup and the name-match
 *   fallback miss, this now no-ops cleanly (no insert/update, no throw) --
 *   changed from the original throw-on-miss, because name matching is
 *   inherently less certain than exact-id matching, and a miss here is no
 *   longer assumed to indicate a sync-ordering bug (providers are still
 *   synced ahead of encounters as reference data, but `RenderingProvider`'s
 *   exact text format against `providers.name` was never verified against a
 *   real Tebra account) -- the same "routine, no data yet" read already
 *   applied to an unmatched `patientId` above.
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
 * Task 3's connector notes) -- mapped (Fix C2b) via the connector's own
 * `mapAppointmentStatus` (tebra.client.ts), reused verbatim rather than
 * duplicated, since it already writes into this exact
 * `appointmentStatusEnum` column and its keyword rules already handle a
 * "completed"-containing raw value correctly (encounters' own real-world
 * value, e.g. "Completed"). Postgres previously rejected any raw Tebra
 * status string outside the enum's exact value list ("invalid input value
 * for enum") with zero runtime validation -- this was a direct cast
 * (`data.status as AppointmentStatus`). `encounters` has NO `notes` column
 * (unlike `charges`/`insuranceClaims`), so an unrecognized raw value's
 * original text is acceptably lost in the fallback case (falls back to
 * `mapAppointmentStatus`'s own default, 'scheduled') -- not ideal, but there
 * is nowhere on this table to preserve it without a schema migration, which
 * is out of scope for this fix round.
 */
export async function upsertEncounterFromTebra(data: TebraEncounterDetail): Promise<void> {
  const db = getDb()
  const patientId = await resolvePatientIdFromTebraId(db, data.patientId)
  if (!patientId) return // routine: this Tebra patient hasn't been identity-matched into Clinsync yet

  let provider: { id: number } | undefined = (
    await db.select({ id: providers.id }).from(providers).where(eq(providers.tebraId, data.providerId))
  )[0]
  if (!provider) {
    // Fallback (Fix C2a): RenderingProvider is a free-text display name, not
    // providers.tebraId's numeric Tebra id -- an exact-id lookup can never
    // match it. Providers are a small reference-data table, so fetching all
    // of them and comparing normalized names in-memory is simple and cheap.
    const allProviders = await db.select({ id: providers.id, name: providers.name }).from(providers)
    const target = normName(data.providerId)
    const nameMatch = allProviders.find((p) => normName(p.name) === target)
    provider = nameMatch ? { id: nameMatch.id } : undefined
  }
  if (!provider) return // routine (Fix C2a): neither an id nor a name match -- not assumed to be a sync-ordering bug

  const [serviceLocation] = await db
    .select({ id: serviceLocations.id })
    .from(serviceLocations)
    .where(eq(serviceLocations.tebraId, data.serviceLocationId))
  if (!serviceLocation) {
    throw new Error(
      `upsertEncounterFromTebra: no service location found for Tebra serviceLocationId "${data.serviceLocationId}" -- sync service locations before encounters`
    )
  }

  const status: AppointmentStatus = mapAppointmentStatus(data.status)

  await db
    .insert(encounters)
    .values({
      tebraId: data.tebraId,
      patientId,
      providerId: provider.id,
      serviceLocationId: serviceLocation.id,
      serviceStartDate: data.serviceStartDate,
      serviceEndDate: data.serviceEndDate,
      status,
      source: 'tebra',
    })
    .onConflictDoUpdate({
      target: [encounters.tebraId],
      targetWhere: sql`${encounters.tebraId} is not null`,
      set: {
        patientId,
        providerId: provider.id,
        serviceLocationId: serviceLocation.id,
        serviceStartDate: data.serviceStartDate,
        serviceEndDate: data.serviceEndDate,
        status,
      },
    })
}

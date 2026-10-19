import { getDb } from '@/db/client'
import { EhrConnectorError } from '@/connectors/errors'
import type { TebraConnector, TebraAppointment } from '@/connectors/types'
import { getCursor, claimCursor, releaseCursor, type SyncCursorEntity } from '@/lib/queries/sync-cursors'
import { recordSyncRun } from '@/lib/queries/sync-runs'
import { upsertAppointmentFromTebra, resolvePatientIdFromTebraId } from '@/lib/queries/appointments'
import { upsertChargeFromTebra } from '@/lib/queries/charges'
import { upsertEncounterFromTebra, getEncounterByTebraId } from '@/lib/queries/encounters'
import { upsertPaymentFromTebra } from '@/lib/queries/payments'
import { upsertProviderFromTebra } from '@/lib/queries/providers'
import { upsertServiceLocationFromTebra } from '@/lib/queries/service-locations'
import { upsertProcedureCodeFromTebra } from '@/lib/queries/procedure-codes'

// The brief's literal signature (`now: () => Date = Date.now`) is a type
// error -- `Date.now` returns a `number`, not a `Date`. `() => new Date()` is
// the obviously-intended default (a real "current time" producing a `Date`,
// matching every call site below and the "fake now" tests inject).
const realNow = (): Date => new Date()

/**
 * Fixed `practiceId` for both cron endpoints (Task 8). Nothing in this
 * codebase resolves a real Tebra practice id -- Clinsync is single-tenant
 * per deployment (one set of Tebra credentials per instance, via the
 * `app_settings` singleton row; see `src/connectors/index.ts`'s
 * `getEhrConnectors()`), so there is no per-practice loop anywhere and no
 * real id to plug in here.
 *
 * `getCursor`/`claimCursor`/`releaseCursor`/`recordSyncRun` (sync-cursors.ts,
 * sync-runs.ts) only need `practiceId` to be STABLE and CONSISTENT across
 * runs for the same practice -- it's a bookkeeping key, not required to
 * literally equal Tebra's own numeric practice id. A constant string
 * satisfies that exactly for a single-tenant deployment. A future
 * multi-practice deployment would need to resolve a real per-practice id
 * (and loop over practices) when wiring up its own cron trigger -- that is
 * out of this plan's scope.
 */
export const DEFAULT_PRACTICE_ID = 'default'

/**
 * Shared per-entity claim -> attempt -> release/record bookkeeping used by
 * both runIncrementalSync (3 entities) and runReferenceSync (3 entities) --
 * see Correction 4. `attempt` does the entity-specific fetch+upsert work and
 * resolves with the count of records fetched/processed (used verbatim as
 * `recordSyncRun`'s `recordsProcessed`, even when zero -- an empty pull is
 * still a successful attempt that advances the cursor).
 *
 * Ordering: `getCursor` is called BEFORE `claimCursor`, because
 * `claimCursor` auto-creates the row (with an epoch placeholder) on a
 * first-ever claim via its atomic upsert -- calling `getCursor` first is
 * what lets it correctly report `null` for "never synced" (sync-cursors.ts's
 * own doc comment on `claimCursor`).
 *
 * If `claimCursor` returns false (an overlapping run already owns this
 * entity/practice pair), this entity is skipped entirely: no fetch, no
 * release, no `recordSyncRun` -- nothing was actually attempted here, so
 * there is nothing for this call to record.
 *
 * A caught `EhrConnectorError` releases the cursor with the OLD cursor value
 * (or an epoch sentinel for a first-ever, now-failed attempt) and outcome
 * `'failed'` -- never `now()` -- so a retry on the next tick re-covers the
 * same window instead of silently skipping data. Any other exception is a
 * genuine bug, not an expected vendor hiccup, and is left to propagate
 * rather than being swallowed as a 'failed' sync outcome.
 */
async function syncEntity(
  entityType: SyncCursorEntity,
  practiceId: string,
  now: () => Date,
  attempt: (previousCursor: Date | null) => Promise<number>,
): Promise<void> {
  const previousCursor = await getCursor(entityType, practiceId)
  const claimed = await claimCursor(entityType, practiceId)
  if (!claimed) return

  const startedAt = now()
  try {
    const recordsProcessed = await attempt(previousCursor)
    await releaseCursor(entityType, practiceId, now(), 'idle')
    await recordSyncRun(entityType, startedAt, now(), recordsProcessed, 'ok')
  } catch (err) {
    if (err instanceof EhrConnectorError) {
      await releaseCursor(entityType, practiceId, previousCursor ?? new Date(0), 'failed')
      await recordSyncRun(entityType, startedAt, now(), 0, 'failed', err.kind)
      return
    }
    throw err
  }
}

function lastModifiedFilter(previousCursor: Date | null): { fromLastModifiedDate?: string } {
  // ASSUMPTION: the format Tebra expects for `fromLastModifiedDate` isn't
  // pinned down anywhere in this codebase (no test or comment specifies
  // it) -- `toISOString()` is a reasonable, standard default, but this is
  // worth verifying against a real/sandbox Tebra account before this ships.
  return { fromLastModifiedDate: previousCursor ? previousCursor.toISOString() : undefined }
}

/**
 * Pulls appointments, charges, and payments from Tebra for `practiceId`,
 * incrementally (each gated by its own cursor). Patients are explicitly OUT
 * OF SCOPE -- patient demographic sync is a separate, pre-existing,
 * human-gated system (`src/lib/ehr-sync.ts`) this function does not touch.
 */
export async function runIncrementalSync(client: TebraConnector, practiceId: string, now: () => Date = realNow): Promise<void> {
  // Kept in scope across the three independent entity attempts below so the
  // payments step (Correction 3) can resolve a patientId via this run's
  // fetched appointments, even if the appointments step itself failed or
  // was skipped this run (in which case this just stays empty).
  let fetchedAppointments: TebraAppointment[] = []

  await syncEntity('appointment', practiceId, now, async (previousCursor) => {
    const raw = await client.getAppointments(lastModifiedFilter(previousCursor))
    fetchedAppointments = raw
    for (const appointment of raw) {
      await upsertAppointmentFromTebra(appointment)
    }
    return raw.length
  })

  await syncEntity('charge', practiceId, now, async (previousCursor) => {
    // Correction 2: fetch raw charges, then discover + upsert any new
    // encounters they reference BEFORE upserting the charges themselves.
    // upsertChargeFromTebra resolves encounterId via an encounters.tebraId
    // lookup at upsert time -- doing this in the naive order (charges then
    // encounters) would leave a brand-new charge's encounterId permanently
    // null, since a pure incremental pull won't re-fetch an already-synced
    // charge next run unless it's modified again.
    const rawCharges = await client.getCharges(lastModifiedFilter(previousCursor))

    const encounterIds = [...new Set(rawCharges.map((c) => c.encounterId).filter((id): id is string => id !== null))]
    for (const encounterId of encounterIds) {
      const existing = await getEncounterByTebraId(encounterId)
      if (existing) continue // Review Focus's no-duplicate-fetch case -- don't spend a GetEncounterDetails call on it again
      const detail = await client.getEncounterDetails(encounterId)
      if (detail) await upsertEncounterFromTebra(detail)
    }

    for (const charge of rawCharges) {
      await upsertChargeFromTebra(charge)
    }
    return rawCharges.length
  })

  await syncEntity('payment', practiceId, now, async (previousCursor) => {
    const rawPayments = await client.getPayments(lastModifiedFilter(previousCursor))

    // Correction 3: TebraPayment carries no real patient reference. Resolve
    // one via this run's fetched appointments (appointment.tebraId ->
    // appointment.patientId), then through the usual raw-Tebra-id ->
    // Clinsync patients.id lookup (resolvePatientIdFromTebraId, reused from
    // appointments.ts -- not reimplemented).
    const appointmentPatientByTebraId = new Map(fetchedAppointments.map((a) => [a.tebraId, a.patientId]))
    const db = getDb()

    for (const payment of rawPayments) {
      let patientId = ''
      const rawPatientId = payment.appointmentId ? appointmentPatientByTebraId.get(payment.appointmentId) : undefined
      if (rawPatientId) {
        patientId = (await resolvePatientIdFromTebraId(db, rawPatientId)) ?? ''
      }
      // upsertPaymentFromTebra no-ops cleanly on a blank patientId -- covers:
      // no appointmentId, appointment not in this run's batch, or no
      // identity-matched patient for that appointment's raw Tebra id.
      await upsertPaymentFromTebra({ ...payment, patientId })
    }
    return rawPayments.length
  })
}

/**
 * Full pull (no date filter -- these lists are small reference data) of
 * providers, service locations, and procedure codes, each gated by its own
 * cursor the same way runIncrementalSync's entities are.
 */
export async function runReferenceSync(client: TebraConnector, practiceId: string, now: () => Date = realNow): Promise<void> {
  await syncEntity('provider', practiceId, now, async () => {
    const raw = await client.getProviders()
    for (const provider of raw) {
      await upsertProviderFromTebra(provider)
    }
    return raw.length
  })

  await syncEntity('serviceLocation', practiceId, now, async () => {
    const raw = await client.getServiceLocations()
    for (const serviceLocation of raw) {
      await upsertServiceLocationFromTebra(serviceLocation)
    }
    return raw.length
  })

  await syncEntity('procedureCode', practiceId, now, async () => {
    const raw = await client.getProcedureCodes()
    for (const procedureCode of raw) {
      await upsertProcedureCodeFromTebra(procedureCode)
    }
    return raw.length
  })
}

import { getDb } from '@/db/client'
import { appointments } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { EhrConnectorError } from '@/connectors/errors'
import type { TebraConnector } from '@/connectors/types'
import { getCursor, claimCursor, releaseCursor, type SyncCursorEntity } from '@/lib/queries/sync-cursors'
import { recordSyncRun } from '@/lib/queries/sync-runs'
import { upsertAppointmentFromTebra } from '@/lib/queries/appointments'
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

// 5-minute overlap buffer used by syncEntity's success-path watermark (Fix
// I4) -- see its doc comment.
const SYNC_WATERMARK_OVERLAP_MS = 5 * 60 * 1000

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
 * ANY caught error (Fix C1 -- not just `EhrConnectorError`) releases the
 * cursor with the OLD cursor value (or an epoch sentinel for a first-ever,
 * now-failed attempt) and outcome `'failed'` -- never `now()` -- so a retry
 * on the next tick re-covers the same window instead of silently skipping
 * data. This file originally only caught `EhrConnectorError`, letting any
 * other exception propagate out of `runIncrementalSync`/`runReferenceSync`,
 * aborting every remaining entity in that run too and leaving this entity's
 * cursor wedged at `'running'` forever (recoverable only by Fix C1's
 * claimCursor lease, see sync-cursors.ts) -- but several of this codebase's
 * own upsert functions throw a plain `Error` on ordinary, expected
 * real-world inputs (e.g. a provider-lookup miss), so that was reachable on
 * day one, not a theoretical edge case. `syncEntity` must always resolve,
 * never reject, once a claim was obtained -- the `errorKind` recorded for a
 * non-`EhrConnectorError` is the literal string `'unknown'` (sync-runs.ts
 * widens its `errorKind` parameter to accept this).
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

  // Captured immediately before `attempt` issues its fetch request -- this
  // (not the time the WHOLE attempt, upserts included, finishes) is what the
  // next run's cursor should resume from on success (Fix I4). A charge-step
  // attempt can run many sequential GetEncounterDetails calls paced at ~1/sec
  // -- minutes to hours for a large backfill -- so using the finish time as
  // the new watermark would silently skip anything modified in Tebra between
  // request-sent and whole-attempt-finished.
  const startedAt = now()
  try {
    const recordsProcessed = await attempt(previousCursor)
    const finishedAt = now()
    // 5-minute overlap buffer (Tebra's own documented polling cadence is
    // 5-10 minutes) so a record modified exactly at/near the fetch-start
    // boundary isn't missed. Upserts are idempotent, so a few minutes of
    // re-processing already-synced records on the next run costs nothing.
    // This also naturally removes the double independent `now()` call the
    // Task 7 review flagged (releaseCursor(..., now(), ...) then
    // recordSyncRun(..., now(), ...) used to call now() twice for what's
    // conceptually one "finished at" moment) -- a single `finishedAt` is
    // captured once and reused for recordSyncRun, while releaseCursor's
    // watermark is derived from `startedAt`, not `now()` at all.
    const newCursor = new Date(startedAt.getTime() - SYNC_WATERMARK_OVERLAP_MS)
    await releaseCursor(entityType, practiceId, newCursor, 'idle')
    await recordSyncRun(entityType, startedAt, finishedAt, recordsProcessed, 'ok')
  } catch (err) {
    const finishedAt = now()
    const errorKind = err instanceof EhrConnectorError ? err.kind : 'unknown'
    await releaseCursor(entityType, practiceId, previousCursor ?? new Date(0), 'failed')
    await recordSyncRun(entityType, startedAt, finishedAt, 0, 'failed', errorKind)
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
  await syncEntity('appointment', practiceId, now, async (previousCursor) => {
    const raw = await client.getAppointments(lastModifiedFilter(previousCursor))
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

    // Fix I2: TebraPayment carries no real patient reference of its own --
    // resolve one via its appointmentId against the already-synced
    // `appointments` TABLE (not just this run's in-memory batch, as this
    // originally read). Payments are typically posted days after the visit,
    // well outside the appointment's own incremental sync window, so the
    // matching appointment was very likely synced in an EARLIER run, not
    // this one -- the original in-run-only map would silently and
    // PERMANENTLY drop the patient link for nearly every real payment (the
    // payment cursor still advances past it, since upsertPaymentFromTebra's
    // blank-patientId no-op isn't an error). `appointments.patientId` is
    // already the resolved Clinsync `patients.id` (upsertAppointmentFromTebra
    // resolves it via resolvePatientIdFromTebraId at write time), so no
    // second raw-Tebra-id resolution step is needed here -- a single lookup
    // against the stored table is both simpler and more correct than the
    // original two-step design (query the committed table directly, read the
    // already-resolved id straight off it).
    const db = getDb()

    for (const payment of rawPayments) {
      let patientId = ''
      if (payment.appointmentId) {
        const [appt] = await db
          .select({ patientId: appointments.patientId })
          .from(appointments)
          .where(eq(appointments.tebraId, payment.appointmentId))
        if (appt) patientId = appt.patientId
      }
      // upsertPaymentFromTebra no-ops cleanly on a blank patientId -- covers:
      // no appointmentId, or an appointment that genuinely hasn't been synced
      // yet (a legitimate "try again next run" case, not a defect -- this
      // should now be much rarer than before, not eliminated).
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

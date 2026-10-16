import { getDb } from '@/db/client'
import { charges, patients, encounters } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, invalidateBillingCaches, chargesListCacheKey, chargeDetailCacheKey } from '@/lib/cache'
import type { TebraCharge } from '@/connectors/types'

// Re-exported for existing importers -- the actual definitions live in the
// DB-free src/lib/charge-status.ts so client components (ChargesTable) can
// import the real workflow logic too, instead of hand-maintaining a copy.
export { type ChargeStatus, isAllowedChargeTransition } from '@/lib/charge-status'
import type { ChargeStatus } from '@/lib/charge-status'

// `TebraCharge` (Task 2's connector type) carries no provider identifier at
// all -- Tebra's ChargeData only reaches a provider through its encounter
// (EncounterDetailsData.ProviderID), and `encounters` is a separate, later
// sync step that may not have run yet for a newly-seen encounterId.
// `charges.providerName` is NOT NULL, so a Tebra-sourced charge gets this
// placeholder until a later task threads real provider resolution through
// (exported so it's directly assertable from tests, and so a future task
// can recognise/replace it once that resolution exists).
export const TEBRA_CHARGE_PROVIDER_PLACEHOLDER = 'Tebra Sync (provider unresolved)'

export interface DiagnosisCodeInput { code: string; description: string }
export interface ProcedureCodeInput { code: string; description: string; units: number; chargeCents: number }

export interface CreateChargeInput {
  patientId: string
  providerName: string
  dateOfService: string
  diagnosisCodes: DiagnosisCodeInput[]
  procedureCodes: ProcedureCodeInput[]
  amountCents: number
  notes?: string
}

export async function listCharges() {
  return getOrSetCache(chargesListCacheKey(), 30, async () => {
    const rows = await getDb()
      .select({ charge: charges, patient: patients })
      .from(charges)
      .innerJoin(patients, eq(charges.patientId, patients.id))
      // Seed/demo data has many charges sharing the same dateOfService, and
      // Postgres doesn't guarantee tie order is stable across statements --
      // an UPDATE (e.g. an Approve click) can silently reshuffle which row
      // shows up where, making the table look like it "did nothing" or
      // changed the wrong row. desc(id) breaks ties deterministically.
      .orderBy(desc(charges.dateOfService), desc(charges.id))
    return rows.map((r) => ({ ...r.charge, patientName: r.patient.nameTebra ?? r.patient.nameIntakeq ?? r.patient.name }))
  })
}

export async function getCharge(id: number) {
  return getOrSetCache(chargeDetailCacheKey(id), 30, async () => {
    const [row] = await getDb()
      .select({ charge: charges, patient: patients })
      .from(charges)
      .innerJoin(patients, eq(charges.patientId, patients.id))
      .where(eq(charges.id, id))
    if (!row) return null
    return {
      ...row.charge,
      patientName: row.patient.nameTebra ?? row.patient.nameIntakeq ?? row.patient.name,
      patientDob: row.patient.dobTebra ?? row.patient.dobIntakeq ?? row.patient.dob,
    }
  })
}

export async function createCharge(input: CreateChargeInput) {
  const [created] = await getDb().insert(charges).values({ ...input, status: 'draft' }).returning()
  await invalidateChargesList()
  await invalidateBillingCaches()
  return created
}

export async function updateChargeStatus(id: number, status: ChargeStatus) {
  await getDb().update(charges).set({ status }).where(eq(charges.id, id))
  await invalidateChargesList()
  await invalidateCache(chargeDetailCacheKey(id))
  await invalidateBillingCaches()
}

export async function invalidateChargesList() {
  await invalidateCache(chargesListCacheKey())
}

/**
 * Upserts a charge synced from Tebra, matched on `tebraId` -- inserts if
 * absent, updates if present. Never touches a `source: 'clinsync'` row: the
 * unique index on `tebraId` (Task 1) is partial (`WHERE tebra_id IS NOT
 * NULL`), so `ON CONFLICT` inference needs `targetWhere` to match that
 * predicate (see `upsertProviderFromTebra`'s comment for the full
 * reasoning) -- a clinsync-origin charge always has `tebraId: null`, so it
 * can never be the row Postgres finds conflicting here.
 *
 * `TebraCharge.encounterId` is Tebra's own encounter id (string | null) --
 * resolved here to our internal serial `encounters.id` via
 * `encounters.tebraId` when present and already synced; left `null`
 * otherwise, matching the schema comment on `charges.encounterId` ("null
 * for charges created before encounters existed"). `patientId` is passed
 * straight through -- see `upsertAppointmentFromTebra`'s comment for why
 * that resolution is this function's caller's job, not this function's.
 *
 * Does NOT yet upsert `insuranceClaims` rows from `data.primaryInsurance` /
 * `secondaryInsurance` / `tertiaryInsurance` -- intentionally left
 * unimplemented. `insuranceClaims` has no unique constraint on
 * `(chargeId, payerName)` (only a partial unique index on `tebraId`, which
 * Tebra's claim payload doesn't supply per-claim), so the brief's specified
 * matching strategy can't be implemented without either a schema change or
 * a racy SELECT-then-insert-or-update, neither of which this task is
 * authorized to do on its own -- see task-5-report.md.
 */
export async function upsertChargeFromTebra(data: TebraCharge): Promise<void> {
  const db = getDb()

  let encounterId: number | null = null
  if (data.encounterId) {
    const [encounter] = await db.select({ id: encounters.id }).from(encounters).where(eq(encounters.tebraId, data.encounterId))
    encounterId = encounter?.id ?? null
  }

  await db
    .insert(charges)
    .values({
      patientId: data.patientId,
      providerName: TEBRA_CHARGE_PROVIDER_PLACEHOLDER,
      dateOfService: data.dateOfService,
      diagnosisCodes: data.diagnosisCodes,
      procedureCodes: data.procedureCodes,
      amountCents: data.amountCents,
      status: data.status as ChargeStatus,
      source: 'tebra',
      tebraId: data.tebraId,
      encounterId,
    })
    .onConflictDoUpdate({
      target: [charges.tebraId],
      targetWhere: sql`${charges.tebraId} is not null`,
      set: {
        patientId: data.patientId,
        dateOfService: data.dateOfService,
        diagnosisCodes: data.diagnosisCodes,
        procedureCodes: data.procedureCodes,
        amountCents: data.amountCents,
        status: data.status as ChargeStatus,
        encounterId,
      },
    })

  await invalidateChargesList()
  await invalidateBillingCaches()
}

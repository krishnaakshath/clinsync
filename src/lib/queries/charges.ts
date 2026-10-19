import { getDb } from '@/db/client'
import { charges, patients, encounters, insuranceClaims, insuranceClaimStatusEnum } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, invalidateBillingCaches, chargesListCacheKey, chargeDetailCacheKey, insuranceClaimsListCacheKey } from '@/lib/cache'
import { resolvePatientIdFromTebraId } from '@/lib/queries/appointments'
import type { TebraCharge } from '@/connectors/types'
import type { InsuranceClaimDetail } from '@/connectors/types'

type InsuranceClaimStatus = (typeof insuranceClaimStatusEnum.enumValues)[number]

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

// Fix C2b: Tebra's ChargeData.Status / InsuranceClaimDetail.status are
// free-text strings (real values seen in a live test fixture: "Approved",
// "Insurance Payment") that were previously cast directly into these
// Postgres enums with zero runtime validation (`data.status as ChargeStatus`
// / `detail.status as InsuranceClaimStatus`) -- any value outside the exact
// enum value list fails the whole upsert with "invalid input value for
// enum", and (post Fix C1) that failure just re-attempts the SAME unmapped
// value forever, never succeeding. These are explicit, documented keyword
// mappings -- same style as tebra.client.ts's `mapAppointmentStatus`:
// case-insensitive substring match, a safe documented fallback, never a
// silently invented match.

const CHARGE_STATUS_KEYWORDS: Array<[RegExp, ChargeStatus]> = [
  [/approved/i, 'approved'],
  [/submit/i, 'submitted'],
  [/pending/i, 'pending_approval'],
]

/** Falls back to 'draft' for anything unrecognized -- a charge stuck in
 * draft needs human review, which is safer than guessing a wrong terminal
 * state. */
function mapChargeStatus(raw: string): ChargeStatus {
  for (const [re, status] of CHARGE_STATUS_KEYWORDS) if (re.test(raw)) return status
  return 'draft'
}

const INSURANCE_CLAIM_STATUS_KEYWORDS: Array<[RegExp, InsuranceClaimStatus]> = [
  [/denied/i, 'denied'],
  [/reject/i, 'rejected'],
  [/paid|payment/i, 'paid'],
  [/adjudicat/i, 'waiting_adjudication'],
]

/** Falls back to 'needs_investigation' -- the enum's own existing catch-all/
 * review-needed value -- for anything unrecognized. */
function mapInsuranceClaimStatus(raw: string): InsuranceClaimStatus {
  for (const [re, status] of INSURANCE_CLAIM_STATUS_KEYWORDS) if (re.test(raw)) return status
  return 'needs_investigation'
}

/**
 * Appends `(Tebra status: "<raw>")` to `existingNotes` (or sets it, if
 * `existingNotes` is empty) -- idempotent, so re-syncing the same
 * unrecognized raw value doesn't accumulate duplicate tags across repeated
 * syncs. Only ever called when a mapping function's FALLBACK path was used
 * (not on every write), so a human reviewer can see what Tebra actually
 * said whenever the mapping couldn't confidently classify it.
 */
function appendUnmappedStatusNote(existingNotes: string | null, rawValue: string): string {
  const tag = `(Tebra status: "${rawValue}")`
  if (existingNotes && existingNotes.includes(tag)) return existingNotes
  return existingNotes ? `${existingNotes} ${tag}` : tag
}

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
  const [created] = await getDb().insert(charges).values({ ...input, status: 'draft', source: 'clinsync', tebraId: null }).returning()
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
 * Upserts one `insuranceClaims` row for a single tier (primary/secondary/
 * tertiary) of a charge's insurance detail. Matched on a *synthetic*
 * `tebraId` -- `${chargeTebraId}:${tier}` -- rather than the brief's
 * originally-specified `(chargeId, payerName)` (no unique constraint exists
 * for that pair; see task-5-report.md for the full history). Per
 * controller ruling: this is also more correct than `(chargeId, payerName)`
 * would have been -- a payer renamed/corrected between syncs under that key
 * would read as a brand-new claim rather than an update, stranding the old
 * row; keying on the charge's own stable `tebraId` + a fixed tier suffix
 * avoids that entirely, and the design spec only requires "one row per
 * payer per charge," never literally `payerName` as part of the identity.
 *
 * A `null` `detail` (Tebra not reporting this tier) is a no-op -- it must
 * NOT delete or otherwise touch a previously-synced tier's row; Tebra
 * omitting a tier on one payload isn't the same as that tier being removed.
 *
 * `submittedDate` (NOT NULL on `insuranceClaims`) has no equivalent on
 * `InsuranceClaimDetail` -- Tebra's per-claim payload gives no submission
 * date of its own -- so this uses the parent charge's `dateOfService` as
 * the best available proxy, same reasoning as `TEBRA_CHARGE_PROVIDER_PLACEHOLDER`.
 *
 * `status` is mapped (Fix C2b) via `mapInsuranceClaimStatus`, not cast
 * directly -- see that function's doc comment. On its fallback path (raw
 * value didn't cleanly match a known keyword), the raw value is appended to
 * `notes` (`insuranceClaims.notes` is nullable `text`) via
 * `appendUnmappedStatusNote`, read against this SAME tier row's existing
 * notes (by its synthetic `tebraId`) so a prior fallback tag isn't
 * duplicated and any note isn't clobbered on a clean re-sync.
 */
async function upsertInsuranceClaimTier(
  db: ReturnType<typeof getDb>,
  chargeTebraId: string,
  chargeId: number,
  patientId: string,
  dateOfService: string,
  tier: 'primary' | 'secondary' | 'tertiary',
  detail: InsuranceClaimDetail | null,
): Promise<void> {
  if (!detail) return // Tebra not reporting this tier isn't the same as it being removed -- never touch a prior sync's row for it.

  const tebraId = `${chargeTebraId}:${tier}`
  const status = mapInsuranceClaimStatus(detail.status)
  const matchedKeyword = INSURANCE_CLAIM_STATUS_KEYWORDS.some(([re]) => re.test(detail.status))
  let notes: string | undefined
  if (!matchedKeyword) {
    const [existing] = await db.select({ notes: insuranceClaims.notes }).from(insuranceClaims).where(eq(insuranceClaims.tebraId, tebraId))
    notes = appendUnmappedStatusNote(existing?.notes ?? null, detail.status)
  }

  await db
    .insert(insuranceClaims)
    .values({
      chargeId,
      patientId,
      payerName: detail.payerName,
      billedAmountCents: detail.billedAmountCents,
      paidAmountCents: detail.paidAmountCents,
      status,
      submittedDate: dateOfService,
      source: 'tebra',
      tebraId,
      ...(notes !== undefined ? { notes } : {}),
    })
    .onConflictDoUpdate({
      target: [insuranceClaims.tebraId],
      targetWhere: sql`${insuranceClaims.tebraId} is not null`,
      set: {
        chargeId,
        patientId,
        payerName: detail.payerName,
        billedAmountCents: detail.billedAmountCents,
        paidAmountCents: detail.paidAmountCents,
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    })
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
 * for charges created before encounters existed"). `TebraCharge.patientId`
 * is resolved via `resolvePatientIdFromTebraId` (see its doc comment in
 * `appointments.ts`) -- if that Tebra patient hasn't been identity-matched
 * into Clinsync yet, this cleanly no-ops (no throw, no insert/update, no
 * `insuranceClaims` writes either) rather than erroring, since that's a
 * routine, expected state.
 *
 * Also upserts one `insuranceClaims` row per non-null insurance tier on
 * `data` (primary/secondary/tertiary) -- see `upsertInsuranceClaimTier`'s
 * doc comment for the matching strategy.
 *
 * `status` is mapped (Fix C2b) via `mapChargeStatus`, not cast directly --
 * see that function's doc comment. On its fallback path, the raw value is
 * appended to `notes` via `appendUnmappedStatusNote`, read against this same
 * charge's existing notes (by `tebraId`) first so a prior fallback tag isn't
 * duplicated and any note isn't clobbered on a clean re-sync.
 */
export async function upsertChargeFromTebra(data: TebraCharge): Promise<void> {
  const db = getDb()
  const patientId = await resolvePatientIdFromTebraId(db, data.patientId)
  if (!patientId) return // routine: this Tebra patient hasn't been identity-matched into Clinsync yet

  let encounterId: number | null = null
  if (data.encounterId) {
    const [encounter] = await db.select({ id: encounters.id }).from(encounters).where(eq(encounters.tebraId, data.encounterId))
    encounterId = encounter?.id ?? null
  }

  const status = mapChargeStatus(data.status)
  const matchedKeyword = CHARGE_STATUS_KEYWORDS.some(([re]) => re.test(data.status))
  let notes: string | undefined
  if (!matchedKeyword) {
    const [existing] = await db.select({ notes: charges.notes }).from(charges).where(eq(charges.tebraId, data.tebraId))
    notes = appendUnmappedStatusNote(existing?.notes ?? null, data.status)
  }

  const [chargeRow] = await db
    .insert(charges)
    .values({
      patientId,
      providerName: TEBRA_CHARGE_PROVIDER_PLACEHOLDER,
      dateOfService: data.dateOfService,
      diagnosisCodes: data.diagnosisCodes,
      procedureCodes: data.procedureCodes,
      amountCents: data.amountCents,
      status,
      source: 'tebra',
      tebraId: data.tebraId,
      encounterId,
      ...(notes !== undefined ? { notes } : {}),
    })
    .onConflictDoUpdate({
      target: [charges.tebraId],
      targetWhere: sql`${charges.tebraId} is not null`,
      set: {
        patientId,
        dateOfService: data.dateOfService,
        diagnosisCodes: data.diagnosisCodes,
        procedureCodes: data.procedureCodes,
        amountCents: data.amountCents,
        status,
        encounterId,
        ...(notes !== undefined ? { notes } : {}),
      },
    })
    .returning({ id: charges.id })

  await upsertInsuranceClaimTier(db, data.tebraId, chargeRow.id, patientId, data.dateOfService, 'primary', data.primaryInsurance)
  await upsertInsuranceClaimTier(db, data.tebraId, chargeRow.id, patientId, data.dateOfService, 'secondary', data.secondaryInsurance)
  await upsertInsuranceClaimTier(db, data.tebraId, chargeRow.id, patientId, data.dateOfService, 'tertiary', data.tertiaryInsurance)

  await invalidateChargesList()
  await invalidateCache(insuranceClaimsListCacheKey())
  await invalidateBillingCaches()
}

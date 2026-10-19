import { getDb } from '@/db/client'
import { payments, charges, patients } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getOrSetCache, paymentsListCacheKey } from '@/lib/cache'
import type { TebraPayment } from '@/connectors/types'

export async function listPayments() {
  return getOrSetCache(paymentsListCacheKey(), 30, async () => {
    const rows = await getDb()
      .select({ payment: payments, patient: patients })
      .from(payments)
      .innerJoin(patients, eq(payments.patientId, patients.id))
      // Seed/demo data has many payments sharing the same postedDate, and
      // Postgres doesn't guarantee tie order is stable across statements --
      // an UPDATE (e.g. a sync) can silently reshuffle which row shows up
      // where. desc(id) breaks ties deterministically.
      .orderBy(desc(payments.postedDate), desc(payments.id))
    return rows.map((r) => ({ ...r.payment, patientName: r.patient.nameTebra ?? r.patient.nameIntakeq ?? r.patient.name }))
  })
}

/**
 * Upserts a payment synced from Tebra, matched on `tebraId` -- inserts if
 * absent, updates if present.
 *
 * `payments.tebraId` is `text(...).notNull()` with a PLAIN unique index (no
 * `source` column on this table -- Tebra-only reference/record data,
 * confirmed against `src/db/schema.ts`), so the bare
 * `target: [payments.tebraId]` below is correct and sufficient -- no
 * `targetWhere`, same reasoning as `encounters`/`serviceLocations`/
 * `procedureCodes`.
 *
 * `patientId` -- a CONFIRMED GAP, not something this function works around.
 * Per Task 3's connector report, real Tebra `PaymentData` carries no
 * `PatientID` field at all, and `TebraPayment` (Task 2's type) doesn't carry
 * an `AppointmentID` either (the only field that could indirectly link a
 * payment to a patient). So `data.patientId` is always `''` in the current
 * pipeline -- there is no Tebra id here to resolve, unlike
 * `upsertEncounterFromTebra`'s `patientId`. This function therefore does NO
 * Tebra-id lookup for `patientId`: it treats `data.patientId` as something a
 * future caller is responsible for pre-resolving to a real `patients.id`
 * before calling this function. If `data.patientId` is blank/falsy, this
 * no-ops cleanly (no insert, no throw) -- `payments.patientId` is NOT NULL
 * with an FK to `patients.id`, so there is nothing valid to write. When a
 * future caller does supply an already-resolved `patients.id`, this
 * upserts normally.
 *
 * `chargeId` is nullable on `payments` and typed `string | null` on
 * `TebraPayment` (always `null` from today's real connector, since Tebra's
 * `PaymentData` doesn't expose a charge/claim join key either -- but this is
 * built correctly per the type contract for when that changes). If present,
 * resolved via a `charges.tebraId` lookup; if absent or unmatched, left
 * `null` -- same "leave it null, don't fail the row" precedent as
 * `upsertChargeFromTebra`'s `encounterId` handling (`charges.ts`), never
 * blocking or skipping the whole payment over a missing link.
 */
export async function upsertPaymentFromTebra(data: TebraPayment): Promise<void> {
  if (!data.patientId) return // no Tebra id reaches this function to resolve -- a future caller must pre-resolve this before calling

  const db = getDb()

  let chargeId: number | null = null
  if (data.chargeId) {
    const [charge] = await db.select({ id: charges.id }).from(charges).where(eq(charges.tebraId, data.chargeId))
    chargeId = charge?.id ?? null
  }

  await db
    .insert(payments)
    .values({
      tebraId: data.tebraId,
      patientId: data.patientId,
      chargeId,
      payerName: data.payerName,
      payerType: data.payerType,
      amountCents: data.amountCents,
      method: data.method,
      postedDate: data.postedDate,
    })
    .onConflictDoUpdate({
      target: [payments.tebraId],
      set: {
        patientId: data.patientId,
        chargeId,
        payerName: data.payerName,
        payerType: data.payerType,
        amountCents: data.amountCents,
        method: data.method,
        postedDate: data.postedDate,
      },
    })
}

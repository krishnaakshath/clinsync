import { getDb } from '@/db/client'
import { medicationDispenses, medicationInventory, medicationEpisodes, patients, medications } from '@/db/schema'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

export interface DispenseInput {
  patientId: string
  medicationId: number
  medicationEpisodeId: number | null
  quantity: number
  dispensedByName: string
  notes: string | null
}

export interface DispenseResult {
  ok: boolean
  error?: string
  dispenseId?: number
}

// The stock decrement is a single conditional UPDATE (quantity_on_hand >=
// requested in the WHERE, not a separate read-then-write) so two concurrent
// dispenses of the same drug can't both succeed past the actual stock --
// same race-safety pattern as Front Desk's room assignment and the MAR's
// administerMedication elsewhere in this codebase.
//
// patientId/medicationId existence is validated BEFORE the decrement
// (matching the getPayerById/'Unknown payer' pattern in the eligibility-check
// route) for two reasons: (1) it turns a bad FK into a clean 400 instead of
// an unhandled FK-violation 500 on the medicationDispenses insert -- with no
// existence check, an unknown patientId would let the stock decrement commit
// and then fail the insert, silently destroying stock with no audit trail;
// (2) it removes the ambiguity where an unknown medicationId previously fell
// through the conditional UPDATE's WHERE clause (no matching row) and was
// misreported as "not enough stock" (409) instead of "unknown medication" (400).
//
// The decrement and the dispense insert are wrapped in a single
// db.transaction() so they commit or roll back together -- without this, a
// post-existence-check failure (or any other error) between the two
// statements could still leave stock decremented with no matching dispense
// row.
export async function dispenseMedication(input: DispenseInput): Promise<DispenseResult> {
  const db = getDb()

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, input.patientId))
  if (!patient) return { ok: false, error: 'Unknown patient' }

  const [medication] = await db.select({ id: medications.id }).from(medications).where(eq(medications.id, input.medicationId))
  if (!medication) return { ok: false, error: 'Unknown medication' }

  if (input.medicationEpisodeId !== null) {
    const [episode] = await db.select().from(medicationEpisodes).where(eq(medicationEpisodes.id, input.medicationEpisodeId))
    if (!episode || episode.patientId !== input.patientId) {
      return { ok: false, error: 'medicationEpisodeId does not belong to this patient' }
    }
  }

  return db.transaction(async (tx) => {
    const decremented = await tx.update(medicationInventory)
      .set({ quantityOnHand: sql`${medicationInventory.quantityOnHand} - ${input.quantity}`, updatedAt: new Date() })
      .where(and(eq(medicationInventory.medicationId, input.medicationId), gte(medicationInventory.quantityOnHand, input.quantity)))
      .returning({ id: medicationInventory.id })
    if (decremented.length === 0) return { ok: false, error: 'Not enough stock on hand for this quantity' }

    const [created] = await tx.insert(medicationDispenses).values({
      patientId: input.patientId, medicationId: input.medicationId, medicationEpisodeId: input.medicationEpisodeId,
      quantity: input.quantity, dispensedByName: input.dispensedByName, notes: input.notes,
    }).returning()

    return { ok: true, dispenseId: created.id }
  })
}

export async function listDispensesForPatient(patientId: string) {
  // Secondary sort on id breaks ties between dispenses sharing the same
  // dispensedAt timestamp (defaultNow() has millisecond resolution, so this
  // is possible for near-simultaneous dispenses), giving a stable order.
  return getDb().select().from(medicationDispenses).where(eq(medicationDispenses.patientId, patientId)).orderBy(desc(medicationDispenses.dispensedAt), desc(medicationDispenses.id))
}

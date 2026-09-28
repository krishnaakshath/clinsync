import { getDb } from '@/db/client'
import { medicationDispenses, medicationInventory, medicationEpisodes } from '@/db/schema'
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
export async function dispenseMedication(input: DispenseInput): Promise<DispenseResult> {
  const db = getDb()

  if (input.medicationEpisodeId !== null) {
    const [episode] = await db.select().from(medicationEpisodes).where(eq(medicationEpisodes.id, input.medicationEpisodeId))
    if (!episode || episode.patientId !== input.patientId) {
      return { ok: false, error: 'medicationEpisodeId does not belong to this patient' }
    }
  }

  const decremented = await db.update(medicationInventory)
    .set({ quantityOnHand: sql`${medicationInventory.quantityOnHand} - ${input.quantity}`, updatedAt: new Date() })
    .where(and(eq(medicationInventory.medicationId, input.medicationId), gte(medicationInventory.quantityOnHand, input.quantity)))
    .returning({ id: medicationInventory.id })
  if (decremented.length === 0) return { ok: false, error: 'Not enough stock on hand for this quantity' }

  const [created] = await db.insert(medicationDispenses).values({
    patientId: input.patientId, medicationId: input.medicationId, medicationEpisodeId: input.medicationEpisodeId,
    quantity: input.quantity, dispensedByName: input.dispensedByName, notes: input.notes,
  }).returning()

  return { ok: true, dispenseId: created.id }
}

export async function listDispensesForPatient(patientId: string) {
  return getDb().select().from(medicationDispenses).where(eq(medicationDispenses.patientId, patientId)).orderBy(desc(medicationDispenses.dispensedAt))
}

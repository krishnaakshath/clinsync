import { getDb } from '@/db/client'
import { medications, medicationInventory } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'

export interface MedicationWithInventory {
  id: number
  name: string
  genericName: string | null
  medicationClass: string
  commonDose: string | null
  form: 'tablet' | 'capsule' | 'liquid' | 'injection' | 'other'
  quantityOnHand: number
  reorderThreshold: number
  unit: string
}

export async function listMedicationsWithInventory(): Promise<MedicationWithInventory[]> {
  const rows = await getDb()
    .select({
      id: medications.id, name: medications.name, genericName: medications.genericName,
      medicationClass: medications.medicationClass, commonDose: medications.commonDose, form: medications.form,
      quantityOnHand: medicationInventory.quantityOnHand, reorderThreshold: medicationInventory.reorderThreshold, unit: medicationInventory.unit,
    })
    .from(medications)
    .innerJoin(medicationInventory, eq(medicationInventory.medicationId, medications.id))
    .orderBy(asc(medications.name))
  return rows
}

export async function getMedicationById(id: number) {
  const [row] = await getDb().select().from(medications).where(eq(medications.id, id))
  return row ?? null
}

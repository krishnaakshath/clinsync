import { describe, it, expect } from 'vitest'
import { listMedicationsWithInventory, getMedicationById } from '@/lib/queries/medications'

describe('medications queries', () => {
  it('lists medications with their inventory joined', async () => {
    const all = await listMedicationsWithInventory()
    expect(all.length).toBeGreaterThanOrEqual(15)
    expect(all.every((m) => typeof m.quantityOnHand === 'number')).toBe(true)
    expect(all.some((m) => m.name === 'Sertraline')).toBe(true)
  })

  it('gets a single medication by id', async () => {
    const all = await listMedicationsWithInventory()
    const byId = await getMedicationById(all[0].id)
    expect(byId?.name).toBe(all[0].name)
  })
})

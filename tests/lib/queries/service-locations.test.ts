import { describe, it, expect, afterEach } from 'vitest'
import { upsertServiceLocationFromTebra } from '@/lib/queries/service-locations'
import { getDb } from '@/db/client'
import { serviceLocations } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('upsertServiceLocationFromTebra', () => {
  // Unique per test-run tebraId so repeated runs against the shared dev DB
  // never collide with a row a previous run left behind.
  const testTebraId = `tebra-test-service-location-${Date.now()}`

  afterEach(async () => {
    await getDb().delete(serviceLocations).where(eq(serviceLocations.tebraId, testTebraId))
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertServiceLocationFromTebra({ tebraId: testTebraId, name: 'Main Clinic' })

    const rowsAfterFirst = await getDb().select().from(serviceLocations).where(eq(serviceLocations.tebraId, testTebraId))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].name).toBe('Main Clinic')

    await upsertServiceLocationFromTebra({ tebraId: testTebraId, name: 'Main Clinic (renamed)' })

    const rowsAfterSecond = await getDb().select().from(serviceLocations).where(eq(serviceLocations.tebraId, testTebraId))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].name).toBe('Main Clinic (renamed)')
  })
})

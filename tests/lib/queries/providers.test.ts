import { describe, it, expect, afterEach } from 'vitest'
import { listActiveProviders, upsertProviderFromTebra } from '@/lib/queries/providers'
import { getDb } from '@/db/client'
import { providers } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('listActiveProviders', () => {
  it('returns the seeded provider roster', async () => {
    const providers = await listActiveProviders()
    expect(providers.length).toBe(5)
    expect(providers.every((p) => p.isActive)).toBe(true)
  })
})

describe('upsertProviderFromTebra', () => {
  // Unique per test-run tebraId so repeated runs against the shared dev DB
  // never collide with a row a previous run left behind.
  const testTebraId = `tebra-test-provider-${Date.now()}`

  afterEach(async () => {
    await getDb().delete(providers).where(eq(providers.tebraId, testTebraId))
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertProviderFromTebra({ tebraId: testTebraId, name: 'Dr. Sync Test', credentials: 'MD', specialty: 'Psychiatry' })

    const rowsAfterFirst = await getDb().select().from(providers).where(eq(providers.tebraId, testTebraId))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].name).toBe('Dr. Sync Test')
    expect(rowsAfterFirst[0].credentials).toBe('MD')
    expect(rowsAfterFirst[0].specialty).toBe('Psychiatry')
    expect(rowsAfterFirst[0].source).toBe('tebra')
    const assignedColorTag = rowsAfterFirst[0].colorTag

    await upsertProviderFromTebra({ tebraId: testTebraId, name: 'Dr. Sync Test Updated', credentials: 'DO', specialty: 'Neurology' })

    const rowsAfterSecond = await getDb().select().from(providers).where(eq(providers.tebraId, testTebraId))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].name).toBe('Dr. Sync Test Updated')
    expect(rowsAfterSecond[0].credentials).toBe('DO')
    expect(rowsAfterSecond[0].specialty).toBe('Neurology')
    // colorTag is a pure display concern assigned once on insert -- a resync
    // must never reassign it.
    expect(rowsAfterSecond[0].colorTag).toBe(assignedColorTag)
  })

  it('never touches an existing source: clinsync provider row (conflict target only matches tebra-origin rows)', async () => {
    const before = await getDb().select().from(providers)
    const clinsyncCountBefore = before.filter((p) => p.source === 'clinsync').length

    await upsertProviderFromTebra({ tebraId: testTebraId, name: 'Dr. Sync Test', credentials: 'MD', specialty: 'Psychiatry' })

    const after = await getDb().select().from(providers)
    const clinsyncCountAfter = after.filter((p) => p.source === 'clinsync').length
    expect(clinsyncCountAfter).toBe(clinsyncCountBefore)
  })
})

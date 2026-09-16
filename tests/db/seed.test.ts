import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from '@/db/client'
import { trials, patients, identityMatches } from '@/db/schema'
import { seed } from '@/db/seed'

describe('seed', () => {
  beforeAll(async () => {
    await seed()
  }, 60000)

  it('creates exactly 2 trials covering different conditions', async () => {
    const rows = await getDb().select().from(trials)
    expect(rows.length).toBe(2)
    const conditions = rows.map((r) => r.condition)
    expect(new Set(conditions).size).toBe(2)
  })

  it('creates at least 15 patients', async () => {
    const rows = await getDb().select().from(patients)
    expect(rows.length).toBeGreaterThanOrEqual(15)
  })

  it('creates at least 2 pending identity matches', async () => {
    const rows = await getDb().select().from(identityMatches)
    expect(rows.filter((r) => r.status === 'pending').length).toBeGreaterThanOrEqual(2)
  })
})

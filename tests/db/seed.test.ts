import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from '@/db/client'
import { trials, patients, identityMatches, broadcasts, reviews } from '@/db/schema'
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

  it('creates the seeded broadcasts with recipient snapshots', async () => {
    const rows = await getDb().select().from(broadcasts)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.every((r) => Array.isArray(r.recipients) && r.recipients.length === r.recipientCount)).toBe(true)
  })

  it('creates the seeded pre-screening experience surveys, including at least one still-sent response', async () => {
    const rows = await getDb().select().from(reviews)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.some((r) => r.status === 'sent')).toBe(true)
    expect(rows.some((r) => r.status === 'completed' && r.ratingOverall !== null)).toBe(true)
  })
})

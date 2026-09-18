import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from '@/db/client'
import { trials, patients, identityMatches, charges, insuranceClaims, patientStatements, mockPayments, providers, appointments } from '@/db/schema'
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

  it('creates charges covering every status in the workflow', async () => {
    const rows = await getDb().select().from(charges)
    expect(rows.length).toBeGreaterThanOrEqual(11)
    const statuses = new Set(rows.map((r) => r.status))
    expect(statuses).toEqual(new Set(['draft', 'pending_approval', 'approved', 'submitted']))
  })

  it('creates insurance claims covering rejected/denied/waiting/needs-investigation/paid', async () => {
    const rows = await getDb().select().from(insuranceClaims)
    const statuses = new Set(rows.map((r) => r.status))
    expect(statuses).toEqual(new Set(['rejected', 'denied', 'waiting_adjudication', 'needs_investigation', 'paid']))
  })

  it('creates patient statements and mock payments', async () => {
    const statements = await getDb().select().from(patientStatements)
    const payments = await getDb().select().from(mockPayments)
    expect(statements.length).toBeGreaterThanOrEqual(4)
    expect(payments.length).toBeGreaterThanOrEqual(2)
    expect(payments.some((p) => p.result === 'success')).toBe(true)
    expect(payments.some((p) => p.result === 'failed')).toBe(true)
  })

  it('creates the independent provider roster (not backfilled from currentProvider)', async () => {
    const rows = await getDb().select().from(providers)
    expect(rows.length).toBe(5)
    expect(new Set(rows.map((r) => r.colorTag)).size).toBe(5)
  })

  it('creates appointments spanning multiple statuses', async () => {
    const rows = await getDb().select().from(appointments)
    expect(rows.length).toBeGreaterThanOrEqual(10)
    const statuses = new Set(rows.map((r) => r.status))
    expect(statuses.has('scheduled')).toBe(true)
    expect(statuses.has('completed')).toBe(true)
    expect(statuses.has('cancelled')).toBe(true)
    expect(statuses.has('no_show')).toBe(true)
  })
})

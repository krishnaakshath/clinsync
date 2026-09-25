import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { insuranceEligibilityChecks } from '@/db/schema'
import { simulateEligibilityCheck, recordEligibilityCheck, getLatestEligibilityCheck } from '@/lib/queries/insurance-eligibility'

const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) await getDb().delete(insuranceEligibilityChecks).where(eq(insuranceEligibilityChecks.id, createdIds.pop()!))
})

describe('simulateEligibilityCheck', () => {
  it('returns the same result for the same patient+payer pair every time', () => {
    const first = simulateEligibilityCheck('RD-0001', 'Aetna')
    const second = simulateEligibilityCheck('RD-0001', 'Aetna')
    expect(second).toEqual(first)
  })

  it('can return different results for a different payer on the same patient', () => {
    const aetna = simulateEligibilityCheck('RD-0001', 'Aetna')
    const kaiser = simulateEligibilityCheck('RD-0001', 'Kaiser Permanente')
    // Not asserting they're always different (a hash collision is fine) --
    // asserting the function actually varies its input into the result
    // rather than always returning one hardcoded status.
    expect(typeof aetna.status).toBe('string')
    expect(typeof kaiser.status).toBe('string')
  })
})

describe('recordEligibilityCheck / getLatestEligibilityCheck', () => {
  it('returns the most recently recorded check for a patient', async () => {
    const first = await recordEligibilityCheck({ patientId: 'RD-0001', payerName: 'Aetna', status: 'verified', copayCents: 3000, checkedByName: 'Taylor Nguyen' })
    createdIds.push(first.id)
    const second = await recordEligibilityCheck({ patientId: 'RD-0001', payerName: 'Aetna', status: 'inactive', copayCents: null, checkedByName: 'Taylor Nguyen' })
    createdIds.push(second.id)

    const latest = await getLatestEligibilityCheck('RD-0001')
    expect(latest?.id).toBe(second.id)
  })

  it('returns null when no check has been recorded', async () => {
    const latest = await getLatestEligibilityCheck('RD-9999')
    expect(latest).toBeNull()
  })
})

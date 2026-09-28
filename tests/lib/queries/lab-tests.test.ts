import { describe, it, expect } from 'vitest'
import { listLabTests } from '@/lib/queries/lab-tests'

describe('lab tests catalog', () => {
  it('lists at least the 10 seeded tests', async () => {
    const all = await listLabTests()
    expect(all.length).toBeGreaterThanOrEqual(10)
    expect(all.some((t) => t.code === 'TSH')).toBe(true)
  })
})

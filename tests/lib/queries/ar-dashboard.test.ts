import { describe, it, expect } from 'vitest'
import { getArDashboardData } from '@/lib/queries/ar-dashboard'

describe('getArDashboardData', () => {
  it('returns non-negative KPIs and a 5-bucket aging chart', async () => {
    const data = await getArDashboardData(new Date('2026-09-17'))
    expect(data.outstandingArCents).toBeGreaterThan(0)
    expect(data.grossCollectionRate).toBeGreaterThanOrEqual(0)
    expect(data.grossCollectionRate).toBeLessThanOrEqual(100)
    expect(data.avgDaysInAr).toBeGreaterThan(0)
    expect(data.agingBuckets).toHaveLength(5)
    expect(data.agingBuckets.map((b) => b.label)).toEqual(['0-30', '31-60', '61-90', '91-120', '121+'])
    // The seed data (Task 2) places at least one outstanding charge in
    // every bucket except the fully-insurance-paid RD-0001 charge.
    expect(data.agingBuckets.every((b) => b.outstandingCents >= 0)).toBe(true)
  })
})

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
    // The seed data (Task 2) fully collects both charges dated into the
    // 0-30 window on purpose -- RD-0001 via a full insurance payment, RD-0005
    // via a deliberately overpaying mock payment (see the Task 9 review) --
    // so 0-30 is $0 by design, while every other bucket carries a real
    // outstanding balance.
    expect(data.agingBuckets[0].outstandingCents).toBe(0)
    expect(data.agingBuckets.slice(1).every((b) => b.outstandingCents > 0)).toBe(true)
    const bucketSum = data.agingBuckets.reduce((sum, b) => sum + b.outstandingCents, 0)
    expect(bucketSum).toBe(data.outstandingArCents)
  })
})

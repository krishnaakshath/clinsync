import { describe, it, expect } from 'vitest'
import { getPipelinePerformance } from '@/lib/queries/pipeline-dashboard'

describe('getPipelinePerformance', () => {
  it('returns all four KPIs for a wide date range', async () => {
    const performance = await getPipelinePerformance({ from: new Date('2000-01-01'), to: new Date() })
    expect(performance.referralsReceived).toBeGreaterThan(0)
    expect(performance.formsCompleted).toBeGreaterThan(0)
    expect(performance.patientsClassified).toBeGreaterThanOrEqual(0)
  })

  it('returns zero referrals for a date range with no data', async () => {
    const performance = await getPipelinePerformance({ from: new Date('1990-01-01'), to: new Date('1990-01-02') })
    expect(performance.referralsReceived).toBe(0)
    expect(performance.avgDaysToClassify).toBeNull()
  })
})

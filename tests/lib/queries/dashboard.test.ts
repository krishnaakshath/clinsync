import { describe, it, expect } from 'vitest'
import { getDashboardData } from '@/lib/queries/dashboard'

describe('getDashboardData', () => {
  it('returns all four widget datasets', async () => {
    const data = await getDashboardData()
    expect(data).toHaveProperty('latestForms')
    expect(data).toHaveProperty('pendingForms')
    expect(data).toHaveProperty('pendingClassification')
    expect(data).toHaveProperty('recentEvents')
  })
})

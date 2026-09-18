import { describe, it, expect } from 'vitest'
import { searchAll } from '@/lib/queries/search'

describe('searchAll', () => {
  it('returns empty results for a blank query', async () => {
    const results = await searchAll('   ')
    expect(results.patients).toEqual([])
    expect(results.trials).toEqual([])
    expect(results.formTemplates).toEqual([])
  })

  it('finds a seeded patient by anonymous id', async () => {
    const results = await searchAll('RD-0001')
    expect(results.patients.some((p) => p.id === 'RD-0001')).toBe(true)
  })

  it('finds a seeded patient by name, case-insensitively', async () => {
    const results = await searchAll('maria')
    expect(results.patients.some((p) => p.label.toLowerCase().includes('maria'))).toBe(true)
  })

  it('finds a seeded trial by condition', async () => {
    const results = await searchAll('depressive')
    expect(results.trials.length).toBeGreaterThan(0)
  })

  it('returns no results for a query that matches nothing', async () => {
    const results = await searchAll('zzzznonexistentzzzz')
    expect(results.patients).toEqual([])
    expect(results.trials).toEqual([])
    expect(results.formTemplates).toEqual([])
  })
})

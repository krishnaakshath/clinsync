import { describe, it, expect } from 'vitest'

describe('/calendar page module', () => {
  it('imports without throwing', async () => {
    const mod = await import('@/app/(dashboard)/calendar/page')
    expect(typeof mod.default).toBe('function')
  })
})

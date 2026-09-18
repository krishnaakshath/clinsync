// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { checkLoginRateLimit } from '@/lib/rate-limit'

describe('checkLoginRateLimit', () => {
  it('allows the first few attempts for a fresh ip+email key', async () => {
    const uniqueEmail = `rl-test-${Date.now()}-${Math.random()}@example.com`
    const first = await checkLoginRateLimit('203.0.113.1', uniqueEmail)
    expect(first.allowed).toBe(true)
  })

  it('blocks after the window is exhausted for one ip+email key', async () => {
    const uniqueEmail = `rl-test-${Date.now()}-${Math.random()}@example.com`
    const ip = '203.0.113.2'
    for (let i = 0; i < 5; i++) {
      const { allowed } = await checkLoginRateLimit(ip, uniqueEmail)
      expect(allowed).toBe(true)
    }
    const sixth = await checkLoginRateLimit(ip, uniqueEmail)
    expect(sixth.allowed).toBe(false)
  })

  it('treats a different email from the same ip as an independent bucket', async () => {
    const ip = '203.0.113.3'
    const emailA = `rl-test-a-${Date.now()}@example.com`
    const emailB = `rl-test-b-${Date.now()}@example.com`
    for (let i = 0; i < 5; i++) await checkLoginRateLimit(ip, emailA)
    const blocked = await checkLoginRateLimit(ip, emailA)
    expect(blocked.allowed).toBe(false)
    const stillAllowed = await checkLoginRateLimit(ip, emailB)
    expect(stillAllowed.allowed).toBe(true)
  })
})

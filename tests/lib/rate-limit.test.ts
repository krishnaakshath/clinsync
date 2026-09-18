// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { checkLoginRateLimit, checkPatientLoginRateLimit } from '@/lib/rate-limit'

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

describe('checkPatientLoginRateLimit', () => {
  it('uses a separate Redis key prefix from checkLoginRateLimit, so exhausting one never touches the other', async () => {
    const ip = '203.0.113.9'
    const sharedId = `rl-test-shared-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      const { allowed } = await checkLoginRateLimit(ip, sharedId)
      expect(allowed).toBe(true)
    }
    // Same ip, same identifier string, but the patient bucket (a distinct
    // 'ratelimit:patient-login' prefix -- see rate-limit.ts) starts fresh.
    const patientStillAllowed = await checkPatientLoginRateLimit(ip, sharedId)
    expect(patientStillAllowed.allowed).toBe(true)
  })

  it('blocks after the window is exhausted for one ip+patientId key', async () => {
    const ip = '203.0.113.10'
    const patientId = `rl-test-patient-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      const { allowed } = await checkPatientLoginRateLimit(ip, patientId)
      expect(allowed).toBe(true)
    }
    const sixth = await checkPatientLoginRateLimit(ip, patientId)
    expect(sixth.allowed).toBe(false)
  })

  it('blocks sustained guessing against one patient id even when spread across many source IPs', async () => {
    // Each individual IP below never exceeds its own 5-per-60s bucket, but
    // the IP-independent global bucket (10 per 600s, keyed on patientId
    // alone) still catches the attacker rotating addresses -- exactly the
    // gap a per-IP-only limiter leaves open.
    const patientId = `rl-test-distributed-${Date.now()}`
    for (let i = 0; i < 10; i++) {
      const { allowed } = await checkPatientLoginRateLimit(`203.0.114.${i}`, patientId)
      expect(allowed).toBe(true)
    }
    const eleventh = await checkPatientLoginRateLimit('203.0.114.99', patientId)
    expect(eleventh.allowed).toBe(false)
  })
})

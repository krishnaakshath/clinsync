import { describe, it, expect } from 'vitest'
import { parseSessionCookie, buildSessionCookieValue } from '@/lib/auth'

describe('auth session cookie', () => {
  it('round-trips role and name through the cookie value', () => {
    const value = buildSessionCookieValue('pi', 'Dr. R. Kunam')
    const parsed = parseSessionCookie(value)
    expect(parsed).toEqual({ role: 'pi', name: 'Dr. R. Kunam' })
  })
  it('returns null for a malformed cookie value', () => {
    expect(parseSessionCookie('not-json')).toBeNull()
  })
})

// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/password'

// Master's code only knows crc/pi/admin, but the shared Postgres `role` enum
// (and its users table) also carries frontdesk/pharmacy/billing/labs rows
// from the hims-platform lineage. Such an account's correct password used
// to "succeed" -- 200, an MFA challenge/session cookie minted for a role
// parseSessionCookie() then rejects -- leaving the user bounced back to
// /login with no error. It must be refused like any invalid login.
const HASH = hashPassword('right-password')
vi.mock('@/lib/rate-limit', () => ({ checkLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/queries/users', () => ({
  findUserByEmail: vi.fn(async () => ({ id: 2147483000, name: 'Front Desk', email: 'fd@example.com', role: 'frontdesk', passwordHash: HASH, mfaSecretEncrypted: null, mfaEnabled: false })),
  getUserMfaState: vi.fn(async () => ({ mfaSecretEncrypted: null, mfaEnabled: false })),
  setUserMfaSecret: vi.fn(async () => {}),
}))

describe('POST /api/login with a role master does not support', () => {
  it('returns 401 and sets no cookie', async () => {
    const { POST } = await import('@/app/api/login/route')
    const res = await POST(new NextRequest('http://localhost/api/login', { method: 'POST', body: JSON.stringify({ email: 'fd@example.com', password: 'right-password' }) }))
    expect(res.status).toBe(401)
    expect(res.headers.getSetCookie()).toEqual([])
    const users = await import('@/lib/queries/users')
    expect(users.setUserMfaSecret).not.toHaveBeenCalled()
  })
})

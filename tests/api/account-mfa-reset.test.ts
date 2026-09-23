// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/lib/password'
import { buildSessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth'
import { POST as resetMfa } from '@/app/api/account/mfa/reset/route'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { setUserMfaSecret, enableUserMfa, getUserMfaState } from '@/lib/queries/users'
import { setAdminMfaSecret, enableAdminMfa, getAdminMfaState } from '@/lib/queries/settings'

const TEST_PASSWORD = 'pi-reset-test-pass-123'
const TEST_EMAIL = 'test-account-mfa-reset@example.com'
let testUserId: number

// Route handler modules are invoked directly (no real Next.js server in
// front of them), so `next/headers`'s cookies() has no request-scoped
// async-local-storage context. vitest.setup.ts's project-wide mock papers
// over that with a silent no-op that always returns "no cookie" -- fine for
// routes that only check "is there a session" against a real HTTP request,
// but useless here, where the test needs requireSession() to actually see
// the session cookie this file puts on each NextRequest. This overrides that
// global mock, for this file only, with a cookies() read scoped to whatever
// request is "current" -- same pattern Tasks 5/6 established in
// login-mfa.test.ts / patient-portal-login-mfa.test.ts.
let currentRequestCookies = new Map<string, string>()

function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!header) return map
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name) map.set(name, value)
  }
  return map
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (currentRequestCookies.has(name) ? { value: currentRequestCookies.get(name) } : undefined),
    set: () => {},
  }),
}))

async function callReset(request: NextRequest) {
  currentRequestCookies = parseCookieHeader(request.headers.get('cookie'))
  return resetMfa(request)
}

beforeAll(async () => {
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com')
  vi.stubEnv('ADMIN_PASSWORD_HASH', hashPassword('admin-test-pass'))
  vi.stubEnv('ADMIN_NAME', 'Test Admin')
  const [row] = await getDb().insert(users).values({ name: 'Reset Test PI', email: TEST_EMAIL, role: 'pi', passwordHash: hashPassword(TEST_PASSWORD) }).returning()
  testUserId = row.id
  await setUserMfaSecret(testUserId, 'enc-secret')
  await enableUserMfa(testUserId)
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await getDb().delete(users).where(eq(users.id, testUserId))
})

async function reqAs(role: 'admin' | 'pi' | 'crc', name: string, body: unknown) {
  const cookie = await buildSessionCookieValue(role, name)
  return new NextRequest('http://localhost/api/account/mfa/reset', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
  })
}

describe('self-service MFA reset', () => {
  it('resets the signed-in DB user\'s own MFA with correct credentials', async () => {
    const res = await callReset(await reqAs('pi', 'Reset Test PI', { email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
    expect((await getUserMfaState(testUserId))?.mfaEnabled).toBe(false)
  })

  it('resets the admin\'s own MFA with correct env credentials', async () => {
    await setAdminMfaSecret('enc-admin-secret')
    await enableAdminMfa()
    const res = await callReset(await reqAs('admin', 'Test Admin', { email: 'admin@example.com', password: 'admin-test-pass' }))
    expect(res.status).toBe(200)
    expect((await getAdminMfaState()).mfaEnabled).toBe(false)
  })

  it('rejects a wrong password', async () => {
    const res = await callReset(await reqAs('pi', 'Reset Test PI', { email: TEST_EMAIL, password: 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('rejects valid credentials for a DIFFERENT account than the caller\'s own session', async () => {
    // A signed-in `pi` session submitting the real admin credentials should
    // not be able to reset the admin's MFA -- see the Review Focus item.
    const res = await callReset(await reqAs('pi', 'Reset Test PI', { email: 'admin@example.com', password: 'admin-test-pass' }))
    expect(res.status).toBe(401)
  })

  it('rejects a signed-in admin session submitting a different staff member\'s genuinely-correct credentials', async () => {
    // Symmetric to the pi-submits-admin-credentials case above: the earlier
    // "resets the signed-in DB user's own MFA" test already disabled this
    // user's MFA, so re-enable it here to prove this rejected attempt --
    // made with the pi user's own real password, but from an `admin`
    // session -- truly has no effect on it.
    await setUserMfaSecret(testUserId, 'enc-secret-2')
    await enableUserMfa(testUserId)
    const res = await callReset(await reqAs('admin', 'Test Admin', { email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(401)
    expect((await getUserMfaState(testUserId))?.mfaEnabled).toBe(true)
  })
})

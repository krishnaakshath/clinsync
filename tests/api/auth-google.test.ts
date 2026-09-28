import { describe, it, expect, vi } from 'vitest'

describe('GET /api/auth/google/start', () => {
  it('returns 500 with a clear message when Google OAuth env vars are not configured', async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID
    const { GET } = await import('@/app/api/auth/google/start/route')
    const res = await GET()
    expect(res.status).toBe(500)
    if (originalClientId) process.env.GOOGLE_CLIENT_ID = originalClientId
  })
})

describe('GET /api/auth/google/callback', () => {
  it('rejects when the state does not match the stored cookie', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    const { GET } = await import('@/app/api/auth/google/callback/route')
    const req = new Request('http://localhost/api/auth/google/callback?code=abc&state=wrong-state', {
      headers: { cookie: 'clinsync_pending_google_oauth=' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects when no pending OAuth cookie is present at all', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    const { GET } = await import('@/app/api/auth/google/callback/route')
    const req = new Request('http://localhost/api/auth/google/callback?code=abc&state=some-state')
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/google/callback identity matching', () => {
  it('never creates a new user row when no existing account matches the Google identity', async () => {
    vi.doMock('@/lib/google-oauth', () => ({
      exchangeCodeForIdentity: vi.fn(async () => ({ sub: 'nonexistent-google-sub-12345', email: 'no-such-account@example.com' })),
      verifyState: vi.fn(() => true),
    }))
    vi.doMock('@/lib/mfa-pending-session', async () => {
      const actual = await vi.importActual<typeof import('@/lib/mfa-pending-session')>('@/lib/mfa-pending-session')
      return { ...actual, getPendingGoogleOAuth: vi.fn(async () => ({ state: 'x', codeVerifier: 'y', nonce: 'z' })), clearPendingGoogleOAuthCookie: vi.fn(async () => undefined) }
    })
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

    // The earlier tests in this file already imported the callback route
    // (and its google-oauth/mfa-pending-session dependencies), so without
    // clearing the module registry `vi.doMock` above would register too
    // late to affect the already-cached modules.
    vi.resetModules()
    const { GET } = await import('@/app/api/auth/google/callback/route')
    const req = new Request('http://localhost/api/auth/google/callback?code=abc&state=x')
    const res = await GET(req as never)
    expect(res.status).toBe(403)

    const { getDb } = await import('@/db/client')
    const { users } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const [found] = await getDb().select().from(users).where(eq(users.email, 'no-such-account@example.com'))
    expect(found).toBeUndefined()
  })

  it('rejects with 403 (and never relinks) when the matched account already has a different googleSub', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn(async () => undefined) }))
    const dbMock = {
      // No row matches by googleSub -- forces the email fallback path.
      select: () => ({ from: () => ({ where: vi.fn(async () => []) }) }),
      update: () => ({ set: updateSet }),
    }
    vi.doMock('@/db/client', () => ({ getDb: () => dbMock }))
    vi.doMock('@/lib/queries/users', () => ({
      findUserByEmail: vi.fn(async () => ({
        id: 42,
        name: 'Existing User',
        email: 'existing@example.com',
        role: 'crc',
        googleSub: 'already-linked-google-sub',
      })),
    }))
    vi.doMock('@/lib/google-oauth', () => ({
      exchangeCodeForIdentity: vi.fn(async () => ({ sub: 'a-different-google-sub', email: 'existing@example.com' })),
      verifyState: vi.fn(() => true),
    }))
    vi.doMock('@/lib/mfa-pending-session', async () => {
      const actual = await vi.importActual<typeof import('@/lib/mfa-pending-session')>('@/lib/mfa-pending-session')
      return { ...actual, getPendingGoogleOAuth: vi.fn(async () => ({ state: 'x', codeVerifier: 'y', nonce: 'z' })), clearPendingGoogleOAuthCookie: vi.fn(async () => undefined) }
    })
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

    vi.resetModules()
    const { GET } = await import('@/app/api/auth/google/callback/route')
    const req = new Request('http://localhost/api/auth/google/callback?code=abc&state=x')
    const res = await GET(req as never)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/already linked to a different google account/i)
    expect(updateSet).not.toHaveBeenCalled()
  })
})

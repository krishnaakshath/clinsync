// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import * as OTPAuth from 'otpauth'
import { encryptSensitive } from '@/lib/crypto'
import { POST as loginRoute } from '@/app/api/patient-portal/login/route'
import { POST as loginMfaRoute } from '@/app/api/patient-portal/login/mfa/route'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { setPatientPortalPassword } from '@/lib/queries/patient-portal'
import { setPatientMfaSecret, enablePatientMfa } from '@/lib/queries/patient-portal'

const TEST_PATIENT_ID = 'RD-LOGIN-MFA-01'
const TEST_PASSWORD = 'patient-test-pass-123'

vi.mock('@/lib/rate-limit', () => ({
  checkPatientLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  checkPatientMfaRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Route handler modules are invoked directly in tests (not through an actual
// Next.js HTTP request), so the project-wide `next/headers` mock in
// vitest.setup.ts stubs `cookies()` with a silent no-op (fine for routes that
// only ever check "is there a session"). This flow's correctness depends on a
// cookie set in one response actually being readable from a later request,
// which a no-op can't do -- same problem, same fix, as tests/api/login-mfa.test.ts
// (the staff equivalent of this file). This overrides that global mock, for
// this file only, with cookies() reads scoped to whatever request is
// "current" and writes captured into an outbox that gets flushed onto the
// real NextResponse the handler returns.
let currentRequestCookies = new Map<string, string>()
let pendingResponseCookieOps = new Map<string, { deleted: true } | { deleted: false; value: string; options?: Record<string, unknown> }>()

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
    get: (name: string) => {
      const op = pendingResponseCookieOps.get(name)
      if (op) return op.deleted ? undefined : { value: op.value }
      return currentRequestCookies.has(name) ? { value: currentRequestCookies.get(name) } : undefined
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      pendingResponseCookieOps.set(name, { deleted: false, value, options })
    },
    delete: (name: string) => {
      pendingResponseCookieOps.set(name, { deleted: true })
    },
  }),
}))

async function withCookieBridge(handler: (request: NextRequest) => Promise<NextResponse>, request: NextRequest): Promise<NextResponse> {
  currentRequestCookies = parseCookieHeader(request.headers.get('cookie'))
  pendingResponseCookieOps = new Map()
  const response = await handler(request)
  for (const [name, op] of pendingResponseCookieOps) {
    if (op.deleted) response.cookies.delete(name)
    else response.cookies.set(name, op.value, op.options)
  }
  return response
}

async function login(request: NextRequest) {
  return withCookieBridge(loginRoute, request)
}
async function loginMfa(request: NextRequest) {
  return withCookieBridge(loginMfaRoute, request)
}

beforeAll(async () => {
  await getDb().insert(patients).values({ id: TEST_PATIENT_ID, intakeqClientIdRef: 'ENC[test]', nameIntakeq: 'Login MFA Test Patient', dobIntakeq: '1990-01-01' })
  await setPatientPortalPassword(TEST_PATIENT_ID, TEST_PASSWORD)
})

afterAll(async () => {
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
})

function req(body: unknown) {
  return new NextRequest('http://localhost/api/patient-portal/login', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}
function mfaReq(body: unknown, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cookie) headers['cookie'] = cookie
  return new NextRequest('http://localhost/api/patient-portal/login/mfa', { method: 'POST', body: JSON.stringify(body), headers })
}

describe('patient login without MFA enabled', () => {
  it('logs in exactly as before -- no mfaRequired in the response', async () => {
    const res = await login(req({ patientId: TEST_PATIENT_ID, password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.cookies.get('clinsync_patient_session')).toBeTruthy()
  })
})

describe('patient login with MFA enabled', () => {
  const secret = new OTPAuth.Secret({ size: 20 })

  beforeAll(async () => {
    await setPatientMfaSecret(TEST_PATIENT_ID, encryptSensitive(secret.base32))
    await enablePatientMfa(TEST_PATIENT_ID)
  })

  it('requires a second step, then a correct code logs in', async () => {
    const res = await login(req({ patientId: TEST_PATIENT_ID, password: TEST_PASSWORD }))
    expect(await res.json()).toEqual({ mfaRequired: true })
    expect(res.cookies.get('clinsync_patient_session')).toBeFalsy()

    const pendingCookie = res.cookies.get('clinsync_pending_patient_mfa')?.value
    const totp = new OTPAuth.TOTP({ issuer: 'Clinsync', label: 'x', algorithm: 'SHA1', digits: 6, period: 30, secret })
    const verifyRes = await loginMfa(mfaReq({ code: totp.generate() }, `clinsync_pending_patient_mfa=${pendingCookie}`))
    expect(verifyRes.status).toBe(200)
    expect(verifyRes.cookies.get('clinsync_patient_session')).toBeTruthy()
  })

  it('rejects a wrong code', async () => {
    const res = await login(req({ patientId: TEST_PATIENT_ID, password: TEST_PASSWORD }))
    const pendingCookie = res.cookies.get('clinsync_pending_patient_mfa')?.value
    const wrongRes = await loginMfa(mfaReq({ code: '000000' }, `clinsync_pending_patient_mfa=${pendingCookie}`))
    expect(wrongRes.status).toBe(401)
  })

  it('returns 401 with no pending cookie', async () => {
    const res = await loginMfa(mfaReq({ code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when the rate limiter disallows the attempt, without checking the code', async () => {
    const { checkPatientMfaRateLimit } = await import('@/lib/rate-limit')
    vi.mocked(checkPatientMfaRateLimit).mockResolvedValueOnce({ allowed: false })

    const res = await login(req({ patientId: TEST_PATIENT_ID, password: TEST_PASSWORD }))
    const pendingCookie = res.cookies.get('clinsync_pending_patient_mfa')?.value
    const blockedRes = await loginMfa(mfaReq({ code: '000000' }, `clinsync_pending_patient_mfa=${pendingCookie}`))
    expect(blockedRes.status).toBe(429)
  })
})

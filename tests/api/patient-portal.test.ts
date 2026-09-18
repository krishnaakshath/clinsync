// @vitest-environment node
//
// Patient portal login signs a session cookie with jose, which under this
// project's default jsdom test environment hits the same cross-realm
// Uint8Array false-positive documented in tests/lib/auth.test.ts. Force
// plain Node here too.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { POST as portalLogin } from '@/app/api/patient-portal/login/route'
import { POST as generatePortalPassword, DELETE as revokePortalPassword } from '@/app/api/patients/[anonId]/portal-password/route'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const TEST_PATIENT_ID = 'RD-0001'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'admin' as const, name: 'Test Admin' })) }
})

// Same reasoning as tests/api/login.test.ts: rate limiting is real (shared
// Upstash Redis), so repeated full-suite runs within the same 60s window
// could otherwise make an unrelated later run's login attempt fail with
// 429 instead of the status this file is actually testing.
vi.mock('@/lib/rate-limit', () => ({
  checkPatientLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

function loginReq(body: unknown) {
  return new NextRequest('http://localhost/api/patient-portal/login', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/patients/[anonId]/portal-password', () => {
  afterEach(async () => {
    // Always leave RD-0001 with no portal password when this file is done --
    // it's a real seeded patient other tests/UIs read.
    await getDb().update(patients).set({ portalPasswordHash: null }).where(eq(patients.id, TEST_PATIENT_ID))
  })

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const res = await generatePortalPassword(new NextRequest('http://localhost', { method: 'POST' }), { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const res = await generatePortalPassword(new NextRequest('http://localhost', { method: 'POST' }), { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    expect(res.status).toBe(403)
  })

  it('generates a real portal password and the patient can then log in with it', async () => {
    const res = await generatePortalPassword(new NextRequest('http://localhost', { method: 'POST' }), { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    expect(res.status).toBe(200)
    const { password } = await res.json()
    expect(typeof password).toBe('string')
    expect(password.length).toBeGreaterThan(5)

    const loginRes = await portalLogin(loginReq({ patientId: TEST_PATIENT_ID, password }))
    expect(loginRes.status).toBe(200)
  })

  it('revoking access makes the previously-issued password stop working', async () => {
    const genRes = await generatePortalPassword(new NextRequest('http://localhost', { method: 'POST' }), { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    const { password } = await genRes.json()

    const revokeRes = await revokePortalPassword(new NextRequest('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    expect(revokeRes.status).toBe(200)

    const loginRes = await portalLogin(loginReq({ patientId: TEST_PATIENT_ID, password }))
    expect(loginRes.status).toBe(401)
  })
})

describe('POST /api/patient-portal/login', () => {
  it('rejects a patient id with no portal access provisioned', async () => {
    // RD-0002 never gets a portal password set anywhere in this suite.
    const res = await portalLogin(loginReq({ patientId: 'RD-0002', password: 'anything' }))
    expect(res.status).toBe(401)
  })

  it('rejects an unknown patient id the same way (never confirms which part was wrong)', async () => {
    const res = await portalLogin(loginReq({ patientId: 'RD-9999', password: 'anything' }))
    expect(res.status).toBe(401)
  })

  it('rejects a malformed payload', async () => {
    const res = await portalLogin(loginReq({ patientId: '' }))
    expect(res.status).toBe(400)
  })
})

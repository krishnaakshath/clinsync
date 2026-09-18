import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
import { GET as listPatients, POST as createPatient } from '@/app/api/patients/route'
import { GET as getPatient } from '@/app/api/patients/[anonId]/route'
import { POST as refreshPatient } from '@/app/api/patients/[anonId]/refresh/route'

// The global setup mock (vitest.setup.ts) stubs `next/headers` so `getSession()`
// resolves to "no session" — that's correct for testing the 401 paths below, but
// these routes are PHI-shaped and require an authenticated session for their
// success paths too. The routes call `requireSession()` (not `getSession()`
// directly), so that's what must be mocked here — mocking `getSession` alone
// wouldn't work, since `requireSession`'s own implementation calls its
// module-internal `getSession` reference, not the re-exported one this file
// could override. Override `requireSession` to return a real session object by
// default, and to return a real 401 NextResponse per-test where we're
// specifically checking the 401 behavior. (Vitest hoists `vi.mock` above all
// imports in this file, including the ones written above it, so this applies
// regardless of order.)
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'crc' as const, name: 'Test CRC' })) }
})

describe('GET /api/patients', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await listPatients(new NextRequest('http://localhost/api/patients'))
    expect(response.status).toBe(401)
  })

  it('returns a list of patients with their overall screening status', async () => {
    const response = await listPatients(new NextRequest('http://localhost/api/patients'))
    const body = await response.json()
    expect(Array.isArray(body.patients)).toBe(true)
    expect(body.patients[0]).toHaveProperty('overallStatus')
  })

  it('filters by trialId when provided', async () => {
    const response = await listPatients(new NextRequest('http://localhost/api/patients?trialId=nct06911112'))
    const body = await response.json()
    expect(body.patients.every((p: any) => p.trialId === 'nct06911112')).toBe(true)
  })
})

describe('GET /api/patients/[anonId]', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await getPatient(new NextRequest('http://localhost/api/patients/RD-0001'), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(response.status).toBe(401)
  })

  it('returns full 30-field detail plus criteria evidence for a known patient', async () => {
    const response = await getPatient(new NextRequest('http://localhost/api/patients/RD-0001'), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    const body = await response.json()
    expect(body.id).toBe('RD-0001')
    expect(body.criteria.length).toBeGreaterThan(0)
  })

  it('returns 404 for an unknown anonymous id', async () => {
    const response = await getPatient(new NextRequest('http://localhost/api/patients/RD-9999'), { params: Promise.resolve({ anonId: 'RD-9999' }) })
    expect(response.status).toBe(404)
  })
})

describe('POST /api/patients', () => {
  // Every successful create leaves a real row in the shared dev DB, so track
  // and delete it -- same pattern as the other write-path tests that mutate
  // real seeded state.
  const createdIds: string[] = []
  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!
      await getDb().delete(patients).where(eq(patients.id, id))
    }
  })

  function req(body: unknown) {
    return new NextRequest('http://localhost/api/patients', { method: 'POST', body: JSON.stringify(body) })
  }

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await createPatient(req({ nameIntakeq: 'Test Patient', dobIntakeq: '1990-01-01' }))
    expect(response.status).toBe(401)
  })

  it('rejects a payload missing the required name or DOB', async () => {
    const response = await createPatient(req({ nameIntakeq: 'Test Patient' }))
    expect(response.status).toBe(400)
  })

  it('rejects a payload with an unexpected extra field', async () => {
    const response = await createPatient(req({ nameIntakeq: 'Test Patient', dobIntakeq: '1990-01-01', ssn: '123-45-6789' }))
    expect(response.status).toBe(400)
  })

  it('creates a patient with the full set of optional intake fields', async () => {
    const response = await createPatient(req({
      nameIntakeq: 'Test Patient',
      dobIntakeq: '1990-01-01',
      emailIntakeq: 'test.patient@example.com',
      phoneIntakeq: '555-0100',
      cityIntakeq: 'Riverside',
      zipIntakeq: '92501',
      currentProvider: 'Dr. Kunam',
      referralType: 'Self-referral',
      availability: 'Weekday mornings',
      commConsentSigned: true,
      commConsentPref: 'email',
      formNotes: 'Prefers email contact.',
    }))
    expect(response.status).toBe(201)
    const body = await response.json()
    createdIds.push(body.id)
    expect(body.id).toMatch(/^RD-\d{4}$/)
    expect(body.cityIntakeq).toBe('Riverside')
    expect(body.currentProvider).toBe('Dr. Kunam')
    expect(body.commConsentSigned).toBe(true)
  })
})

describe('POST /api/patients/[anonId]/refresh', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await refreshPatient(new NextRequest('http://localhost/api/patients/RD-0001/refresh', { method: 'POST' }), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(response.status).toBe(401)
  })

  it('re-evaluates and returns the overall status for a known patient', async () => {
    const response = await refreshPatient(new NextRequest('http://localhost/api/patients/RD-0001/refresh', { method: 'POST' }), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    const body = await response.json()
    expect(['green', 'yellow', 'red']).toContain(body.overallStatus)
  })

  it('returns 404 for an unknown anonymous id', async () => {
    const response = await refreshPatient(new NextRequest('http://localhost/api/patients/RD-9999/refresh', { method: 'POST' }), { params: Promise.resolve({ anonId: 'RD-9999' }) })
    expect(response.status).toBe(404)
  })
})

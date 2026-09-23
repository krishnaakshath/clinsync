import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import * as tebra from '@/connectors/tebra.mock'
import { invalidateCache, patientListCacheKey, patientDetailCacheKey } from '@/lib/cache'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
import { GET as listPatients, POST as createPatient } from '@/app/api/patients/route'
import { GET as getPatient, DELETE as deletePatientRoute } from '@/app/api/patients/[anonId]/route'
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

describe('patient list/detail never expose the encrypted TOTP secret', () => {
  // Both responses are built from whole-row spreads of `patients` and are
  // Redis-cached, so a column added to that table rides along to the client
  // and into the cache unless it's explicitly stripped. Uses its own
  // throwaway patient with a real (fake) secret on file, and invalidates the
  // read-through caches around it so the assertions see a fresh query rather
  // than a 30s-old cached copy that predates this row.
  const LEAK_TEST_ID = 'RD-MFA-LEAK-01'

  beforeAll(async () => {
    await getDb().insert(patients).values({
      id: LEAK_TEST_ID, intakeqClientIdRef: 'ENC[test]', nameIntakeq: 'MFA Leak Test Patient', dobIntakeq: '1990-01-01',
      mfaSecretEncrypted: 'enc-secret-that-must-not-leak', mfaEnabled: true,
    })
    await invalidateCache(patientListCacheKey(null))
    await invalidateCache(patientDetailCacheKey(LEAK_TEST_ID))
  })

  afterAll(async () => {
    await getDb().delete(patients).where(eq(patients.id, LEAK_TEST_ID))
    await invalidateCache(patientListCacheKey(null))
    await invalidateCache(patientDetailCacheKey(LEAK_TEST_ID))
  })

  it('GET /api/patients/[anonId] omits mfaSecretEncrypted but still reports mfaEnabled', async () => {
    const response = await getPatient(new NextRequest(`http://localhost/api/patients/${LEAK_TEST_ID}`), { params: Promise.resolve({ anonId: LEAK_TEST_ID }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).not.toHaveProperty('mfaSecretEncrypted')
    expect(body.mfaEnabled).toBe(true)
    expect(JSON.stringify(body)).not.toContain('enc-secret-that-must-not-leak')
  })

  it('GET /api/patients omits mfaSecretEncrypted from every row', async () => {
    const response = await listPatients(new NextRequest('http://localhost/api/patients'))
    const body = await response.json()
    const row = body.patients.find((p: { id: string }) => p.id === LEAK_TEST_ID)
    expect(row).toBeDefined()
    expect(row.mfaEnabled).toBe(true)
    for (const p of body.patients) expect(p).not.toHaveProperty('mfaSecretEncrypted')
    expect(JSON.stringify(body)).not.toContain('enc-secret-that-must-not-leak')
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
    const response = await createPatient(req({ name: 'Test Patient', dob: '1990-01-01' }))
    expect(response.status).toBe(401)
  })

  it('rejects a payload missing the required name or DOB', async () => {
    const response = await createPatient(req({ name: 'Test Patient' }))
    expect(response.status).toBe(400)
  })

  it('rejects a payload with an unexpected extra field', async () => {
    const response = await createPatient(req({ name: 'Test Patient', dob: '1990-01-01', ssn: '123-45-6789' }))
    expect(response.status).toBe(400)
  })

  it('creates the chart in Tebra first, then mirrors it into a new patient row', async () => {
    const response = await createPatient(req({
      name: 'Test Patient',
      dob: '1990-01-01',
      email: 'test.patient@example.com',
      phone: '555-0100',
      city: 'Riverside',
      zip: '92501',
      currentProvider: 'Dr. Kunam',
    }))
    expect(response.status).toBe(201)
    const body = await response.json()
    createdIds.push(body.id)
    expect(body.id).toMatch(/^RD-\d{4}$/)
    // Tebra is the system of record here -- the chart is filed under
    // nameTebra/dobTebra, with nameIntakeq/dobIntakeq mirrored only to
    // satisfy the schema's NOT NULL pair, not fabricated intake answers.
    expect(body.nameTebra).toBe('Test Patient')
    expect(body.nameIntakeq).toBe('Test Patient')
    expect(body.cityTebra).toBe('Riverside')
    expect(body.currentProvider).toBe('Dr. Kunam')
    expect(body.tebraPatientIdRef).toMatch(/^ENC\[tebra-/)
    expect(body.intakeqClientIdRef).toMatch(/^ENC\[no-intake-/)

    const tebraPatients = await tebra.listPatients()
    expect(tebraPatients.some((p) => `${p.firstName} ${p.lastName}` === 'Test Patient' && p.birthDate === '1990-01-01')).toBe(true)
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

describe('DELETE /api/patients/[anonId]', () => {
  async function createTestPatient(): Promise<string> {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'admin', name: 'Test Admin' })
    const res = await createPatient(new NextRequest('http://localhost/api/patients', { method: 'POST', body: JSON.stringify({ name: 'Delete Route Test', dob: '1993-03-03' }) }))
    const body = await res.json()
    return body.id
  }

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await deletePatientRoute(new NextRequest('http://localhost/api/patients/RD-0001', { method: 'DELETE' }), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(response.status).toBe(401)
  })

  it('rejects a non-admin session -- deleting a chart is an admin-only action', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const response = await deletePatientRoute(new NextRequest('http://localhost/api/patients/RD-0001', { method: 'DELETE' }), { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(response.status).toBe(403)
  })

  it('returns 404 for an unknown anonymous id', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'admin', name: 'Test Admin' })
    const response = await deletePatientRoute(new NextRequest('http://localhost/api/patients/RD-9999/delete-test', { method: 'DELETE' }), { params: Promise.resolve({ anonId: 'RD-9999-delete-test' }) })
    expect(response.status).toBe(404)
  })

  it('permanently removes the patient as an admin', async () => {
    const id = await createTestPatient()
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'admin', name: 'Test Admin' })
    const response = await deletePatientRoute(new NextRequest(`http://localhost/api/patients/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ anonId: id }) })
    expect(response.status).toBe(200)

    const [row] = await getDb().select().from(patients).where(eq(patients.id, id))
    expect(row).toBeUndefined()
    // deletePatient() clears 17 tables as separate sequential round-trips
    // (see its own comment on why none of these FKs cascade at the DB
    // level) -- slower than a single-query test even with nothing to
    // delete in most of them, so this needs more than the default 5s.
  }, 15000)
})

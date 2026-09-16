import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'
import { GET as listPatients } from '@/app/api/patients/route'
import { GET as getPatient } from '@/app/api/patients/[anonId]/route'
import { POST as refreshPatient } from '@/app/api/patients/[anonId]/refresh/route'

// The global setup mock (vitest.setup.ts) stubs `next/headers` so `getSession()`
// resolves to "no session" — that's correct for testing the 401 paths below, but
// these routes are PHI-shaped and require an authenticated session for their
// success paths too. Override `getSession` here to simulate a signed-in CRC by
// default, and restore "no session" per-test where we're specifically checking
// the 401 behavior. (Vitest hoists `vi.mock` above all imports in this file,
// including the ones written above it, so this applies regardless of order.)
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, getSession: vi.fn(async () => ({ role: 'crc' as const, name: 'Test CRC' })) }
})

describe('GET /api/patients', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.getSession).mockResolvedValueOnce(null)
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
    vi.mocked(auth.getSession).mockResolvedValueOnce(null)
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

describe('POST /api/patients/[anonId]/refresh', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.getSession).mockResolvedValueOnce(null)
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

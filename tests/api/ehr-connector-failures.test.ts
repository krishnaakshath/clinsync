import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { EhrConnectorError } from '@/connectors/errors'

// Pure tests (no DB): how routes that use the connector factory behave when
// EHR connections are missing or failing.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'crc' as const, name: 'Test CRC' })) }
})
const getDb = vi.fn(() => { throw new Error('DB must not be touched') })
vi.mock('@/db/client', () => ({ getDb: () => getDb() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
const getEhrConnectors = vi.fn()
vi.mock('@/connectors', () => ({ getEhrConnectors: () => getEhrConnectors() }))
const confirmIdentityMatch = vi.fn()
vi.mock('@/lib/ehr-sync', () => ({ confirmIdentityMatch: (id: number) => confirmIdentityMatch(id) }))

const { POST: createPatient } = await import('@/app/api/patients/route')
const { POST: confirmMatch } = await import('@/app/api/identity-matches/[id]/confirm/route')

const newPatient = () => new NextRequest('http://localhost/api/patients', { method: 'POST', body: JSON.stringify({ name: 'Test Patient', dob: '1990-01-01' }) })

beforeEach(() => {
  getEhrConnectors.mockReset()
  confirmIdentityMatch.mockReset()
})

describe('POST /api/patients with EHR connectors', () => {
  it('returns 503 "not configured" (and never falls back to a mock) when Tebra is not connected', async () => {
    getEhrConnectors.mockResolvedValue({ source: 'live', intakeq: null, tebra: null })
    const res = await createPatient(newPatient())
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/EHR connections are not configured/)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('returns 502 with a safe message when Tebra rejects the call', async () => {
    getEhrConnectors.mockResolvedValue({ source: 'live', intakeq: null, tebra: { createPatient: vi.fn(async () => { throw new EhrConnectorError('tebra', 'auth_failed') }) } })
    const res = await createPatient(newPatient())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Tebra rejected the credentials/)
    expect(getDb).not.toHaveBeenCalled()
  })
})

describe('POST /api/identity-matches/[id]/confirm with EHR connectors', () => {
  it('returns 502 with a safe message when a configured connector fails', async () => {
    confirmIdentityMatch.mockRejectedValue(new EhrConnectorError('intakeq', 'network'))
    const res = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/1/confirm', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Could not reach IntakeQ/)
  })
})

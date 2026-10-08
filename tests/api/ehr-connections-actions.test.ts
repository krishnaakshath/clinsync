import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { EhrConnectorError, EhrNotConfiguredError } from '@/connectors/errors'

// Pure route tests: auth, audit, the connector factory and the sync engine
// are all mocked, so no DB/Redis is needed.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'admin' as const, name: 'Test Admin' })) }
})
const logAudit = vi.fn(async () => {})
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAudit(...(args as [])) }))
const testEhrConnections = vi.fn()
vi.mock('@/connectors', () => ({ testEhrConnections: () => testEhrConnections() }))
const syncFromEhrs = vi.fn()
vi.mock('@/lib/ehr-sync', () => ({ syncFromEhrs: () => syncFromEhrs() }))

const { POST: testRoute } = await import('@/app/api/settings/ehr-connections/test/route')
const { POST: syncRoute } = await import('@/app/api/settings/ehr-connections/sync/route')

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const post = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { method: 'POST', headers })

beforeEach(() => {
  logAudit.mockClear()
  testEhrConnections.mockReset()
  syncFromEhrs.mockReset()
})

describe.each([
  ['test', () => testRoute, 'http://localhost/api/settings/ehr-connections/test'],
  ['sync', () => syncRoute, 'http://localhost/api/settings/ehr-connections/sync'],
] as const)('POST /api/settings/ehr-connections/%s access control', (_name, getRoute, url) => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    expect((await getRoute()(post(url))).status).toBe(401)
  })

  it('returns exact 403 Forbidden for non-admins', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const res = await getRoute()(post(url))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('rejects cross-origin posts', async () => {
    const res = await getRoute()(post(url, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(testEhrConnections).not.toHaveBeenCalled()
    expect(syncFromEhrs).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/ehr-connections/test', () => {
  it('returns the per-vendor result and audits the check', async () => {
    testEhrConnections.mockResolvedValue({ intakeq: { ok: true, message: 'Connected' }, tebra: { ok: false, message: 'Not configured' } })
    const res = await testRoute(post('http://localhost/api/settings/ehr-connections/test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ intakeq: { ok: true, message: 'Connected' }, tebra: { ok: false, message: 'Not configured' } })
    expect(logAudit).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/settings/ehr-connections/sync', () => {
  it('runs the sync and returns its counts', async () => {
    syncFromEhrs.mockResolvedValue({ newPatients: 1, newMatches: 2, refreshedPatients: 3 })
    const res = await syncRoute(post('http://localhost/api/settings/ehr-connections/sync'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ newPatients: 1, newMatches: 2, refreshedPatients: 3 })
    expect(logAudit).toHaveBeenCalledTimes(1)
  })

  it('returns 409 with the canonical message when EHR connections are not configured', async () => {
    syncFromEhrs.mockRejectedValue(new EhrNotConfiguredError())
    const res = await syncRoute(post('http://localhost/api/settings/ehr-connections/sync'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/EHR connections are not configured/)
  })

  it('returns 502 with a safe message on a connector failure', async () => {
    syncFromEhrs.mockRejectedValue(new EhrConnectorError('tebra', 'auth_failed'))
    const res = await syncRoute(post('http://localhost/api/settings/ehr-connections/sync'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Tebra rejected/)
  })

  it('does not swallow unrelated errors', async () => {
    syncFromEhrs.mockRejectedValue(new Error('db down'))
    await expect(syncRoute(post('http://localhost/api/settings/ehr-connections/sync'))).rejects.toThrow('db down')
  })
})

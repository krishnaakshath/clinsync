import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Pure route tests: the Tebra cron endpoints must never touch a real
// connector or the real sync engine. `getEhrConnectors` and both sync
// functions are mocked; `DEFAULT_PRACTICE_ID` is the real exported constant
// (via importActual) so these tests fail honestly if the routes ever stop
// using it.
const getEhrConnectors = vi.fn()
vi.mock('@/connectors', () => ({ getEhrConnectors: () => getEhrConnectors() }))

const runIncrementalSync = vi.fn()
const runReferenceSync = vi.fn()
vi.mock('@/lib/tebra-sync', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tebra-sync')>('@/lib/tebra-sync')
  return { ...actual, runIncrementalSync: (...args: unknown[]) => runIncrementalSync(...args), runReferenceSync: (...args: unknown[]) => runReferenceSync(...args) }
})

const { DEFAULT_PRACTICE_ID } = await import('@/lib/tebra-sync')
const { GET: incrementalGet } = await import('@/app/api/cron/tebra-sync/route')
const { GET: referenceGet } = await import('@/app/api/cron/tebra-sync-reference/route')

const CORRECT_SECRET = 'test-cron-secret'
const fakeTebraConnector = { id: 'fake-tebra-connector' }

function request(url: string, authorization?: string) {
  return new NextRequest(url, { headers: authorization !== undefined ? { authorization } : {} })
}

beforeEach(() => {
  getEhrConnectors.mockReset()
  runIncrementalSync.mockReset()
  runReferenceSync.mockReset()
  vi.stubEnv('CRON_SECRET', CORRECT_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each([
  { name: 'GET /api/cron/tebra-sync', get: incrementalGet, url: 'http://localhost/api/cron/tebra-sync', runSync: runIncrementalSync },
  { name: 'GET /api/cron/tebra-sync-reference', get: referenceGet, url: 'http://localhost/api/cron/tebra-sync-reference', runSync: runReferenceSync },
])('$name', ({ get, url, runSync }) => {
  it('returns 401 and never invokes the sync engine when the Authorization header is missing', async () => {
    const res = await get(request(url))
    expect(res.status).toBe(401)
    expect(getEhrConnectors).not.toHaveBeenCalled()
    expect(runSync).not.toHaveBeenCalled()
  })

  it('returns 401 and never invokes the sync engine when the Authorization header is wrong', async () => {
    const res = await get(request(url, 'Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(getEhrConnectors).not.toHaveBeenCalled()
    expect(runSync).not.toHaveBeenCalled()
  })

  it('returns 200 without running the sync when Tebra is not configured', async () => {
    getEhrConnectors.mockResolvedValue({ source: 'live', intakeq: null, tebra: null })
    const res = await get(request(url, `Bearer ${CORRECT_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ran).toBe(false)
    expect(body.reason).toMatch(/not configured/i)
    expect(runSync).not.toHaveBeenCalled()
  })

  it('invokes the sync engine with the real TebraConnector and the fixed practiceId constant, returning 200', async () => {
    getEhrConnectors.mockResolvedValue({ source: 'live', intakeq: null, tebra: fakeTebraConnector })
    runSync.mockResolvedValue(undefined)
    const res = await get(request(url, `Bearer ${CORRECT_SECRET}`))
    expect(res.status).toBe(200)
    expect(getEhrConnectors).toHaveBeenCalledTimes(1)
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(runSync).toHaveBeenCalledWith(fakeTebraConnector, DEFAULT_PRACTICE_ID)
  })
})

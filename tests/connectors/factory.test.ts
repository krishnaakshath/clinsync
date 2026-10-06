import { describe, it, expect, vi } from 'vitest'
import { getEhrConnectors, requireEhrConnectors, testEhrConnections, isProductionEnv } from '@/connectors'
import { EhrNotConfiguredError, EhrConnectorError } from '@/connectors/errors'
import * as intakeqMock from '@/connectors/intakeq.mock'
import type { EhrCredentials } from '@/lib/queries/settings'

const NONE: EhrCredentials = { intakeq: null, tebra: null }
const BOTH: EhrCredentials = {
  intakeq: { apiKey: 'iq-key' },
  tebra: { customerKey: 'ck', user: 'u', password: 'pw' },
}
const load = (c: EhrCredentials) => vi.fn(async () => c)

describe('isProductionEnv', () => {
  it('treats NODE_ENV=production or VERCEL_ENV=production as production', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true)
    expect(isProductionEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' })).toBe(true)
    expect(isProductionEnv({ NODE_ENV: 'development' })).toBe(false)
    expect(isProductionEnv({ NODE_ENV: 'test' })).toBe(false)
  })
})

describe('getEhrConnectors', () => {
  it('uses the mocks only when EHR_USE_MOCKS=1 outside production, without reading credentials', async () => {
    const loadCredentials = load(BOTH)
    const c = await getEhrConnectors({ env: { NODE_ENV: 'development', EHR_USE_MOCKS: '1' }, loadCredentials })
    expect(c.source).toBe('mock')
    expect(c.intakeq).not.toBeNull()
    expect(await c.intakeq!.getClient('iq-001')).toEqual(await intakeqMock.getClient('iq-001'))
    expect(loadCredentials).not.toHaveBeenCalled()
  })

  it('never uses the mocks in production, even with EHR_USE_MOCKS=1', async () => {
    for (const env of [{ NODE_ENV: 'production', EHR_USE_MOCKS: '1' }, { NODE_ENV: 'development', VERCEL_ENV: 'production', EHR_USE_MOCKS: '1' }]) {
      const c = await getEhrConnectors({ env, loadCredentials: load(NONE) })
      expect(c.source).toBe('live')
      expect(c.intakeq).toBeNull()
      expect(c.tebra).toBeNull()
    }
  })

  it('without the mock flag and without saved credentials, returns a not-configured state (dev too)', async () => {
    const c = await getEhrConnectors({ env: { NODE_ENV: 'development' }, loadCredentials: load(NONE) })
    expect(c).toMatchObject({ source: 'live', intakeq: null, tebra: null })
  })

  it('builds real clients from saved credentials', async () => {
    const c = await getEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load(BOTH) })
    expect(c.source).toBe('live')
    expect(c.intakeq).not.toBeNull()
    expect(c.tebra).not.toBeNull()
    expect(c.tebra!.supportsClinicalData).toBe(false)
  })

  it('builds only the side that is configured', async () => {
    const c = await getEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load({ intakeq: { apiKey: 'k' }, tebra: null }) })
    expect(c.intakeq).not.toBeNull()
    expect(c.tebra).toBeNull()
  })
})

describe('requireEhrConnectors', () => {
  it('throws EhrNotConfiguredError with the canonical message when nothing is configured', async () => {
    await expect(requireEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load(NONE) })).rejects.toThrow(EhrNotConfiguredError)
    await expect(requireEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load(NONE) })).rejects.toThrow(/EHR connections are not configured/)
  })

  it('throws when only one side is configured (sync needs both to avoid duplicate charts)', async () => {
    const err = await requireEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load({ intakeq: null, tebra: BOTH.tebra }) }).catch((e) => e)
    expect(err).toBeInstanceOf(EhrNotConfiguredError)
    expect(err.message).toMatch(/IntakeQ/)
  })

  it('resolves both connectors when configured', async () => {
    const c = await requireEhrConnectors({ env: { NODE_ENV: 'production' }, loadCredentials: load(BOTH) })
    expect(c.intakeq).toBeDefined()
    expect(c.tebra).toBeDefined()
  })
})

describe('testEhrConnections', () => {
  it('reports not configured for missing sides', async () => {
    const result = await testEhrConnections({ env: { NODE_ENV: 'production' }, loadCredentials: load(NONE) })
    expect(result.intakeq.ok).toBe(false)
    expect(result.intakeq.message).toMatch(/not configured/i)
    expect(result.tebra.ok).toBe(false)
  })

  it('returns safe, generic messages for connector failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const result = await testEhrConnections({ env: { NODE_ENV: 'production' }, loadCredentials: load(BOTH), fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} })
    expect(result.intakeq).toEqual({ ok: false, message: expect.stringMatching(/IntakeQ rejected/i) })
    expect(result.tebra.ok).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/iq-key|"pw"|ck/)
  })

  it('reports ok for the mock connectors in dev', async () => {
    const result = await testEhrConnections({ env: { NODE_ENV: 'development', EHR_USE_MOCKS: '1' }, loadCredentials: load(NONE) })
    expect(result.intakeq.ok).toBe(true)
    expect(result.intakeq.message).toMatch(/demo/i)
  })

  it('maps unexpected exceptions to a generic failure instead of leaking them', async () => {
    const loadCredentials = vi.fn(async () => { throw new Error('IDENTITY_ENCRYPTION_KEY secret-ish detail') })
    const result = await testEhrConnections({ env: { NODE_ENV: 'production' }, loadCredentials })
    expect(result.intakeq.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret-ish')
  })
})

describe('EhrConnectorError', () => {
  it('is an Error carrying vendor + kind', () => {
    const e = new EhrConnectorError('tebra', 'auth_failed')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toMatch(/Tebra/)
  })
})

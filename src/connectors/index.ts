import type { IntakeQConnector, TebraConnector } from './types'
import type { EhrCredentials } from '@/lib/queries/settings'
import { EhrConnectorError, EhrNotConfiguredError, safeConnectorMessage, type EhrVendor } from './errors'
import { createIntakeQClient } from './intakeq.client'
import { createTebraClient } from './tebra.client'
import { intakeqMock } from './intakeq.mock'
import { tebraMock } from './tebra.mock'
import type { TransportOptions } from './http'

// The single place that decides which IntakeQ/Tebra implementation the app
// talks to.
//
//  - EHR_USE_MOCKS=1 (and NOT production) -> the in-repo demo mocks. This is
//    for local development and the test suite only.
//  - Otherwise -> real clients built from the credentials an admin saved on
//    Settings -> EHR Connections. A vendor with no saved credentials is
//    `null` ("not configured").
//  - In production (NODE_ENV=production or VERCEL_ENV=production) the mocks
//    are never used, even if EHR_USE_MOCKS is set: a sync with nothing
//    configured fails loudly with "EHR connections are not configured"
//    rather than quietly importing demo patients into a real deployment.

type Env = Record<string, string | undefined>

export interface FactoryOptions extends Pick<TransportOptions, 'fetchImpl' | 'sleep'> {
  env?: Env
  loadCredentials?: () => Promise<EhrCredentials>
}

export interface EhrConnectors {
  source: 'mock' | 'live'
  intakeq: IntakeQConnector | null
  tebra: TebraConnector | null
  /** When Tebra is null because only some of its fields are saved: which are missing. */
  tebraMissing?: string[]
}

export function isProductionEnv(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'
}

export function mocksEnabled(env: Env = process.env): boolean {
  return env.EHR_USE_MOCKS === '1' && !isProductionEnv(env)
}

async function defaultLoadCredentials(): Promise<EhrCredentials> {
  const { getEhrCredentials } = await import('@/lib/queries/settings')
  return getEhrCredentials()
}

export async function getEhrConnectors(options: FactoryOptions = {}): Promise<EhrConnectors> {
  const env = options.env ?? process.env
  if (mocksEnabled(env)) return { source: 'mock', intakeq: intakeqMock, tebra: tebraMock }

  let creds: EhrCredentials
  try {
    creds = await (options.loadCredentials ?? defaultLoadCredentials)()
  } catch {
    // Typically a rotated/missing IDENTITY_ENCRYPTION_KEY. The underlying
    // error is dropped: it can describe key material.
    throw new EhrConnectorError(null, 'not_configured', 'Stored EHR credentials could not be read. Re-enter them in Settings → EHR Connections.')
  }
  const transport = { fetchImpl: options.fetchImpl, sleep: options.sleep }
  return {
    source: 'live',
    intakeq: creds.intakeq ? createIntakeQClient({ apiKey: creds.intakeq.apiKey, ...transport }) : null,
    tebra: creds.tebra ? createTebraClient({ ...creds.tebra, ...transport }) : null,
    tebraMissing: creds.tebraMissing,
  }
}

/**
 * Both connectors, or EhrNotConfiguredError. Sync needs both sides: pulling
 * IntakeQ clients without Tebra to match against would create duplicate
 * charts for people who already have one.
 */
export async function requireEhrConnectors(options: FactoryOptions = {}): Promise<{ intakeq: IntakeQConnector; tebra: TebraConnector; source: 'mock' | 'live' }> {
  const c = await getEhrConnectors(options)
  const missing: EhrVendor[] = []
  if (!c.intakeq) missing.push('intakeq')
  if (!c.tebra) missing.push('tebra')
  if (!c.intakeq || !c.tebra) throw new EhrNotConfiguredError(missing)
  return { intakeq: c.intakeq, tebra: c.tebra, source: c.source }
}

export interface ConnectionCheck { ok: boolean; message: string }

/** Validates each saved credential set with one cheap call. Messages are always safe to display. */
export async function testEhrConnections(options: FactoryOptions = {}): Promise<{ intakeq: ConnectionCheck; tebra: ConnectionCheck }> {
  let c: EhrConnectors
  try {
    c = await getEhrConnectors(options)
  } catch (err) {
    const failed = { ok: false, message: safeConnectorMessage(err) }
    return { intakeq: failed, tebra: failed }
  }

  async function check(vendor: EhrVendor, connector: { testConnection(): Promise<void> } | null): Promise<ConnectionCheck> {
    if (!connector) {
      // All three Tebra fields missing = never set up; some missing = a
      // half-saved setup the admin needs to finish, which is a different fix.
      const missing = vendor === 'tebra' ? (c.tebraMissing ?? []) : []
      if (missing.length > 0 && missing.length < 3) {
        return { ok: false, message: `Setup incomplete: missing ${missing.join(', ')}. Re-enter the customer key, API user and API password together.` }
      }
      return { ok: false, message: 'Not configured' }
    }
    try {
      await connector.testConnection()
      return { ok: true, message: c.source === 'mock' ? 'Connected (demo data — EHR_USE_MOCKS=1)' : 'Connected' }
    } catch (err) {
      return { ok: false, message: safeConnectorMessage(err, vendor) }
    }
  }

  const [intakeq, tebra] = await Promise.all([check('intakeq', c.intakeq), check('tebra', c.tebra)])
  return { intakeq, tebra }
}

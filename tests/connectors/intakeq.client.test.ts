import { describe, it, expect, vi } from 'vitest'
import { createIntakeQClient, INTAKEQ_BASE_URL } from '@/connectors/intakeq.client'
import { EhrConnectorError } from '@/connectors/errors'

const API_KEY = 'iq-SECRET-api-key-0123456789'

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

// Synthetic data only -- shaped like IntakeQ's documented Client object.
function apiClient(id: number, first = `First${id}`, last = `Last${id}`) {
  return { ClientId: id, Name: `${first} ${last}`, FirstName: first, LastName: last, Email: `c${id}@example.com`, Phone: '909-555-0100', MobilePhone: null, DateOfBirth: Date.UTC(1985, 2, 12), City: 'Redlands', PostalCode: '92373' }
}

function makeClient(responses: Array<Response | Error>) {
  const sleep = vi.fn(async () => {})
  const fetchImpl = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra fetch')
    if (next instanceof Error) throw next
    return next
  })
  const client = createIntakeQClient({ apiKey: API_KEY, fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
  return { client, fetchImpl, sleep }
}

async function captureError(p: Promise<unknown>): Promise<EhrConnectorError> {
  try { await p } catch (e) {
    expect(e).toBeInstanceOf(EhrConnectorError)
    const err = e as EhrConnectorError
    expect(`${err.message} ${String(err.stack)} ${JSON.stringify(err)}`).not.toContain(API_KEY)
    return err
  }
  throw new Error('expected rejection')
}

describe('IntakeQ client', () => {
  it('uses the documented base URL and sends the key only in the X-Auth-Key header', async () => {
    const { client, fetchImpl } = makeClient([json([apiClient(1)])])
    await client.listClients()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(INTAKEQ_BASE_URL).toBe('https://intakeq.com/api/v1')
    expect(String(url)).toBe('https://intakeq.com/api/v1/clients?includeProfile=true&page=1')
    expect(String(url)).not.toContain(API_KEY)
    expect(new Headers(init!.headers).get('X-Auth-Key')).toBe(API_KEY)
  })

  it('paginates /clients (100 per page) until a short page and maps the client shape', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => apiClient(i + 1))
    const page2 = [apiClient(101, 'Maria', 'Alvarez')]
    const { client, fetchImpl } = makeClient([json(page1), json(page2)])
    const clients = await client.listClients()
    expect(clients).toHaveLength(101)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1][0])).toContain('page=2')
    expect(clients[100]).toEqual({ clientId: '101', firstName: 'Maria', lastName: 'Alvarez', dateOfBirth: '1985-03-12', city: 'Redlands', zip: '92373', phone: '909-555-0100', email: 'c101@example.com' })
  })

  it('getClient searches by numeric id and returns only an exact id match', async () => {
    const { client, fetchImpl } = makeClient([json([apiClient(12), apiClient(123)])])
    expect((await client.getClient('12'))?.clientId).toBe('12')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('search=12')
    expect(await client.getClient('iq-001')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('getIntakeByClientId takes the most recent submitted intake and maps it', async () => {
    const summaries = [
      { Id: 'old', ClientId: 7, Status: 'Submitted', DateSubmitted: 1000 },
      { Id: 'new', ClientId: 7, Status: 'Submitted', DateSubmitted: 5000 },
    ]
    const full = {
      Id: 'new', ClientId: 7, Status: 'Submitted', DateSubmitted: Date.UTC(2026, 8, 1),
      Questions: [
        { Id: 'q1', Text: 'How were you referred to us?', Answer: 'Provider referral' },
        { Id: 'q2', Text: 'What is your availability for appointments?', Answer: 'Weekday mornings' },
        { Id: 'q3', Text: 'Preferred contact method', Answer: 'Phone' },
        { Id: 'q4', Text: 'PHQ-9 Total Score', Answer: '18' },
      ],
      ConsentForms: [{ Id: 'c1', Name: 'Communication consent', Signed: true }],
    }
    const { client, fetchImpl } = makeClient([json(summaries), json(full)])
    const intake = await client.getIntakeByClientId('7')
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://intakeq.com/api/v1/intakes/summary?clientId=7')
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://intakeq.com/api/v1/intakes/new')
    expect(intake).toEqual({
      intakeId: 'new', clientId: '7', referralType: 'Provider referral', availability: 'Weekday mornings',
      consentSigned: true, consentPreference: 'Phone', ratingScales: [{ name: 'PHQ-9', score: 18, date: '2026-09-01' }],
    })
  })

  it('getIntakeByClientId returns null when the client has no submitted intake', async () => {
    const { client } = makeClient([json([])])
    expect(await client.getIntakeByClientId('7')).toBeNull()
  })

  it('getFullIntake returns null on 404 and URL-encodes the id', async () => {
    const { client, fetchImpl } = makeClient([new Response('', { status: 404 })])
    expect(await client.getFullIntake('a/../b')).toBeNull()
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://intakeq.com/api/v1/intakes/a%2F..%2Fb')
  })

  it('maps 401 to auth_failed and 403 to not_authorized, without retrying', async () => {
    const a = makeClient([new Response('', { status: 401 })])
    expect((await captureError(a.client.listClients())).kind).toBe('auth_failed')
    expect(a.fetchImpl).toHaveBeenCalledTimes(1)
    const b = makeClient([new Response('', { status: 403 })])
    expect((await captureError(b.client.listClients())).kind).toBe('not_authorized')
  })

  it('retries 429 honouring Retry-After, then succeeds', async () => {
    const { client, sleep } = makeClient([new Response('', { status: 429, headers: { 'Retry-After': '2' } }), json([apiClient(1)])])
    expect(await client.listClients()).toHaveLength(1)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('reports rate_limited after 3 attempts', async () => {
    const { client, fetchImpl } = makeClient([new Response('', { status: 429 }), new Response('', { status: 429 }), new Response('', { status: 429 })])
    expect((await captureError(client.listClients())).kind).toBe('rate_limited')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('retries 5xx and network errors; reports network after exhausting', async () => {
    const ok = makeClient([new Response('', { status: 502 }), new TypeError('fetch failed'), json([])])
    expect(await ok.client.listClients()).toEqual([])
    const bad = makeClient([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')])
    expect((await captureError(bad.client.listClients())).kind).toBe('network')
  })

  it('maps a non-JSON body to invalid_response', async () => {
    const { client } = makeClient([new Response('<html>oops</html>', { status: 200 })])
    expect((await captureError(client.listClients())).kind).toBe('invalid_response')
  })

  it('testConnection performs a single cheap /clients search that returns no PHI', async () => {
    const { client, fetchImpl } = makeClient([json([])])
    await client.testConnection()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/^https:\/\/intakeq\.com\/api\/v1\/clients\?search=/)
  })
})

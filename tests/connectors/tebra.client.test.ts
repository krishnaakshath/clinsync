import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { createTebraClient, TEBRA_ENDPOINT } from '@/connectors/tebra.client'
import { EhrConnectorError } from '@/connectors/errors'

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures/tebra', name), 'utf8')

const CREDS = { customerKey: 'SECRET-CUSTOMER-KEY', user: 'api-user@example.com', password: 'S3cret&<pw>' }

// A fake clock: sleep() advances "now" instead of actually waiting, so the
// rate-limit spacing can be asserted deterministically and instantly.
function fakeClock() {
  let t = 1_000_000
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => { sleeps.push(ms); t += ms }),
    sleeps,
  }
}

function soapResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

function makeClient(responses: Array<Response | Error>, extra: Partial<Parameters<typeof createTebraClient>[0]> = {}) {
  const clock = fakeClock()
  const fetchImpl = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra fetch')
    if (next instanceof Error) throw next
    return next
  })
  const client = createTebraClient({ ...CREDS, fetchImpl: fetchImpl as unknown as typeof fetch, now: clock.now, sleep: clock.sleep, ...extra })
  return { client, fetchImpl, clock }
}

async function captureError(p: Promise<unknown>): Promise<EhrConnectorError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(EhrConnectorError)
    return e as EhrConnectorError
  }
  throw new Error('expected rejection')
}

function expectNoSecrets(err: Error) {
  const text = `${err.message} ${String(err.stack)} ${JSON.stringify(err)}`
  expect(text).not.toContain(CREDS.customerKey)
  expect(text).not.toContain(CREDS.password)
  expect(text).not.toContain('S3cret')
}

describe('Tebra SOAP client -- request shape', () => {
  it('POSTs a SOAP 1.1 envelope to the Kareo 2.1 endpoint with the operation SOAPAction', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-patients-ok.xml'))])
    await client.listPatients()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe(TEBRA_ENDPOINT)
    expect(TEBRA_ENDPOINT).toBe('https://webservice.kareo.com/services/soap/2.1/KareoServices.svc')
    expect(init!.method).toBe('POST')
    const headers = new Headers(init!.headers)
    expect(headers.get('SOAPAction')).toBe('"http://www.kareo.com/api/schemas/KareoServices/GetPatients"')
    expect(headers.get('Content-Type')).toMatch(/^text\/xml/)
  })

  it('sends CustomerKey, Password and User (in WCF member order) and XML-escapes every value', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-patients-ok.xml'))])
    await client.listPatients()
    const body = String(fetchImpl.mock.calls[0][1]!.body)
    expect(body).toContain('<sch:CustomerKey>SECRET-CUSTOMER-KEY</sch:CustomerKey>')
    expect(body).toContain('<sch:Password>S3cret&amp;&lt;pw&gt;</sch:Password>')
    expect(body).toContain('<sch:User>api-user@example.com</sch:User>')
    expect(body.indexOf('<sch:CustomerKey>')).toBeLessThan(body.indexOf('<sch:Password>'))
    expect(body.indexOf('<sch:Password>')).toBeLessThan(body.indexOf('<sch:User>'))
    // The request header sits inside the request, before Fields/Filter.
    expect(body.indexOf('<sch:RequestHeader>')).toBeLessThan(body.indexOf('<sch:Fields>'))
  })

  it('escapes hostile search input so it cannot inject elements into the envelope', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-patients-empty.xml'))])
    await client.searchPatient('Eve</sch:FirstName><sch:SSN>1</sch:SSN><sch:FirstName> Smith', '1990-01-01')
    const body = String(fetchImpl.mock.calls[0][1]!.body)
    expect(body).not.toContain('<sch:SSN>')
    expect(body).toContain('Eve&lt;/sch:FirstName&gt;')
    expect(body).toContain('<sch:FromDateOfBirth>1990-01-01</sch:FromDateOfBirth>')
    expect(body).toContain('<sch:ToDateOfBirth>1990-01-01</sch:ToDateOfBirth>')
  })
})

describe('Tebra SOAP client -- responses', () => {
  it('maps GetPatients PatientData into FHIRPatient records (happy path)', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-ok.xml'))])
    const patients = await client.listPatients()
    expect(patients).toEqual([
      { tebraPatientId: '5001', firstName: 'Maria', lastName: 'Alvarez & Co', birthDate: '1985-03-12', city: 'Redlands', zip: '92373', email: 'maria.demo@example.com', generalPractitioner: 'Dr. R. Demo' },
      { tebraPatientId: '5002', firstName: 'Jordan', lastName: 'Reyes', birthDate: '1990-07-22', city: '', zip: '', email: '', generalPractitioner: '' },
    ])
  })

  it('returns an empty list for an empty Patients element', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-empty.xml'))])
    expect(await client.listPatients()).toEqual([])
  })

  it('searchPatient only returns exact name + DOB matches', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-ok.xml'))])
    const results = await client.searchPatient('jordan reyes', '1990-07-22')
    expect(results.map((p) => p.tebraPatientId)).toEqual(['5002'])
  })

  it('getPatientById returns the patient, null for an empty result, and never sends a non-numeric id', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-patient-ok.xml')), soapResponse(fixture('get-patient-empty.xml'))])
    expect((await client.getPatientById('5001'))?.lastName).toBe('Alvarez')
    expect(await client.getPatientById('5002')).toBeNull()
    expect(await client.getPatientById('tebra-001')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][1]!.body)).toContain('<sch:PatientID>5001</sch:PatientID>')
  })

  it('maps SecurityResponse.Authenticated=false to auth_failed without leaking credentials', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-auth-failed.xml'))])
    const err = await captureError(client.listPatients())
    expect(err.kind).toBe('auth_failed')
    expect(err.vendor).toBe('tebra')
    expectNoSecrets(err)
  })

  it('maps SecurityResponse.Authorized=false to not_authorized', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-not-authorized.xml'))])
    expect((await captureError(client.listPatients())).kind).toBe('not_authorized')
  })

  it('maps ErrorResponse.IsError=true to vendor_error and never echoes the vendor message', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-vendor-error.xml'))])
    const err = await captureError(client.listPatients())
    expect(err.kind).toBe('vendor_error')
    expectNoSecrets(err)
    expect(err.message).not.toContain('internal error occurred')
  })

  it('maps malformed XML to invalid_response', async () => {
    const { client } = makeClient([soapResponse(fixture('get-patients-malformed.xml'))])
    expect((await captureError(client.listPatients())).kind).toBe('invalid_response')
  })

  it('maps a SOAP Fault (HTTP 500) to vendor_error without retrying', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('soap-fault.xml'), 500)])
    expect((await captureError(client.listPatients())).kind).toBe('vendor_error')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  // Captured from the live Kareo 2.1 service with deliberately bogus credentials.
  it('maps the live "Invalid customer key" response (CustomerKeyValid=false) to auth_failed', async () => {
    const { client } = makeClient([soapResponse(fixture('live-get-practices-invalid-customer-key.xml'))])
    expect((await captureError(client.testConnection())).kind).toBe('auth_failed')
  })

  it('maps a live InternalServiceFault delivered with HTTP 200 to vendor_error', async () => {
    const { client } = makeClient([soapResponse(fixture('live-get-patient-internal-fault-http200.xml'))])
    expect((await captureError(client.getPatientById('1'))).kind).toBe('vendor_error')
  })

  it('always sends a Filter element on GetPatients (the live service null-refs without one)', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-patients-empty.xml'))])
    await client.listPatients()
    expect(String(fetchImpl.mock.calls[0][1]!.body)).toContain('<sch:Filter></sch:Filter>')
  })

  it('maps an HTTP 401 to auth_failed', async () => {
    const { client } = makeClient([new Response('Unauthorized', { status: 401 })])
    expect((await captureError(client.listPatients())).kind).toBe('auth_failed')
  })
})

describe('Tebra SOAP client -- resilience', () => {
  it('retries 503 with backoff and succeeds', async () => {
    const { client, fetchImpl } = makeClient([new Response('busy', { status: 503 }), soapResponse(fixture('get-patients-ok.xml'))])
    expect(await client.listPatients()).toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after 3 attempts on persistent 429 and reports rate_limited', async () => {
    const { client, fetchImpl } = makeClient([
      new Response('slow down', { status: 429 }),
      new Response('slow down', { status: 429 }),
      new Response('slow down', { status: 429 }),
    ])
    expect((await captureError(client.listPatients())).kind).toBe('rate_limited')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('reports network errors as network, after retrying', async () => {
    const { client, fetchImpl } = makeClient([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')])
    const err = await captureError(client.listPatients())
    expect(err.kind).toBe('network')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expectNoSecrets(err)
  })

  it('aborts a hung request after the timeout', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const client = createTebraClient({ ...CREDS, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20, maxAttempts: 1, minIntervalMs: 0 })
    expect((await captureError(client.listPatients())).kind).toBe('network')
  })

  it('spaces consecutive calls at least 1s apart', async () => {
    const { client, clock, fetchImpl } = makeClient([soapResponse(fixture('get-patients-ok.xml')), soapResponse(fixture('get-patients-ok.xml'))])
    const callTimes: number[] = []
    fetchImpl.mockImplementation(async () => { callTimes.push(clock.now()); return soapResponse(fixture('get-patients-ok.xml')) })
    await client.listPatients()
    await client.listPatients()
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(1000)
  })
})

describe('Tebra SOAP client -- connection test and capabilities', () => {
  it('testConnection calls GetPractices', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-practices-ok.xml'))])
    await client.testConnection()
    expect(new Headers(fetchImpl.mock.calls[0][1]!.headers).get('SOAPAction')).toContain('/GetPractices')
  })

  it('does not claim to provide medications/diagnoses (not exposed per-patient by SOAP 2.1)', async () => {
    const { client, fetchImpl } = makeClient([])
    expect(client.supportsClinicalData).toBe(false)
    expect(await client.getActiveMedications('5001')).toEqual([])
    expect(await client.getConditions('5001')).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('createPatient registers the chart in the single practice and returns its new id', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-practices-ok.xml')), soapResponse(fixture('create-patient-ok.xml'))])
    const created = await client.createPatient({ firstName: 'Test', lastName: "O'Brien <x>", birthDate: '1990-01-01', city: 'Riverside', zip: '92501', email: 't@example.com', generalPractitioner: 'Dr. K' })
    expect(created.tebraPatientId).toBe('6001')
    const body = String(fetchImpl.mock.calls[1][1]!.body)
    expect(body).toContain('<sch:DateofBirth>1990-01-01T00:00:00</sch:DateofBirth>')
    expect(body).toContain('<sch:LastName>O&apos;Brien &lt;x&gt;</sch:LastName>')
    expect(body).toContain('<sch:Practice><sch:PracticeID>1</sch:PracticeID></sch:Practice>')
  })

  it('createPatient refuses to guess when the account has more than one practice', async () => {
    const { client, fetchImpl } = makeClient([soapResponse(fixture('get-practices-two.xml'))])
    const err = await captureError(client.createPatient({ firstName: 'A', lastName: 'B', birthDate: '1990-01-01', city: '', zip: '', email: '', generalPractitioner: '' }))
    expect(err.kind).toBe('configuration')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

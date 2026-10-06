import type { FHIRPatient, TebraConnector } from './types'
import { EhrConnectorError } from './errors'
import { requestWithRetry, realSleep, type TransportOptions } from './http'
import { escapeXml, parseXml, child, childText, childrenNamed, type XmlElement } from './xml'

// Real Tebra (formerly Kareo) SOAP 2.1 client.
//
// Contract taken from the live WSDL/XSD at
//   https://webservice.kareo.com/services/soap/2.1/KareoServices.svc?wsdl
// (SOAP 1.1 binding, target namespace http://www.kareo.com/api/schemas/,
// SOAPAction http://www.kareo.com/api/schemas/KareoServices/<Operation>).
//
//  - Every request carries request/RequestHeader{CustomerKey, Password, User}.
//    All three are required -- the customer key alone does not authenticate.
//  - The service is WCF with DataContract serialization, which is ORDER
//    SENSITIVE: members must appear in alphabetical (ordinal) order, base
//    class members (RequestHeader) first. Out-of-order elements are silently
//    ignored by the server, so builders below always sort.
//  - Responses carry ErrorResponse{IsError, ErrorMessage} and
//    SecurityResponse{Authenticated, Authorized, CustomerKeyValid, ...}.
//  - Calls are spaced >= 1s apart (Tebra throttles GetPatients and friends);
//    429/502/503/504 are retried with backoff.
//  - SOAP 2.1 has no per-patient medication or diagnosis list (diagnoses
//    only exist per encounter via GetEncounterDetails(EncounterID)), so this
//    client reports supportsClinicalData = false and returns [] for those.
//
// Relative imports only (no `@/`): scripts/ehr-connection-check.mjs loads
// this file directly via tsx.

export const TEBRA_ENDPOINT = 'https://webservice.kareo.com/services/soap/2.1/KareoServices.svc'
const SCHEMA_NS = 'http://www.kareo.com/api/schemas/'
const SOAP_ACTION_PREFIX = 'http://www.kareo.com/api/schemas/KareoServices/'
export const TEBRA_MIN_INTERVAL_MS = 1000

export interface TebraClientOptions extends TransportOptions {
  customerKey: string
  user: string
  password: string
  endpoint?: string
  /** Minimum spacing between calls. Default 1000ms. */
  minIntervalMs?: number
  /** Injectable clock for tests. */
  now?: () => number
}

const PATIENT_FIELDS = ['City', 'DOB', 'DefaultRenderingProviderFullName', 'EmailAddress', 'FirstName', 'ID', 'LastName', 'PrimaryCarePhysicianFullName', 'ZipCode']
const PRACTICE_FIELDS = ['Active', 'ID', 'PracticeName']

const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9]*$/
const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function el(name: string, innerXml: string): string {
  // Element names are compile-time constants, but assert anyway so a future
  // caller can't turn a name into an injection point.
  if (!ELEMENT_NAME.test(name)) throw new Error(`invalid SOAP element name: ${name}`)
  return `<sch:${name}>${innerXml}</sch:${name}>`
}
const textEl = (name: string, value: string) => el(name, escapeXml(value))

/** WCF DataContract members, alphabetically ordered. Entries with an empty value are omitted. */
function members(entries: Record<string, string | undefined>, raw: Record<string, string> = {}): string {
  const all: Array<[string, string]> = [
    ...Object.entries(entries).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '').map(([k, v]) => [k, textEl(k, v)] as [string, string]),
    ...Object.entries(raw).map(([k, xml]) => [k, el(k, xml)] as [string, string]),
  ]
  return all.sort((a, b) => ordinal(a[0], b[0])).map(([, xml]) => xml).join('')
}

function fieldsXml(names: string[]): string {
  return el('Fields', [...names].sort(ordinal).map((n) => el(n, 'true')).join(''))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Tebra returns dates as e.g. "3/12/1985 12:00:00 AM" or "1985-03-12T00:00:00". */
export function normalizeTebraDate(value: string | null): string {
  if (!value) return ''
  const v = value.trim()
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return ''
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

function isNil(node: XmlElement | null): boolean {
  return !node || node.attributes['i:nil'] === 'true' || Object.entries(node.attributes).some(([k, v]) => k.endsWith(':nil') && v === 'true')
}

function mapPatient(p: XmlElement): FHIRPatient {
  const t = (name: string) => (childText(p, name) ?? '').trim()
  return {
    tebraPatientId: t('ID'),
    firstName: t('FirstName'),
    lastName: t('LastName'),
    birthDate: normalizeTebraDate(childText(p, 'DOB')),
    city: t('City'),
    zip: t('ZipCode'),
    email: t('EmailAddress'),
    generalPractitioner: t('PrimaryCarePhysicianFullName') || t('DefaultRenderingProviderFullName'),
  }
}

export function createTebraClient(options: TebraClientOptions): TebraConnector {
  const {
    customerKey, user, password,
    endpoint = TEBRA_ENDPOINT,
    minIntervalMs = TEBRA_MIN_INTERVAL_MS,
    now = Date.now,
    ...transport
  } = options
  if (!customerKey || !user || !password) throw new EhrConnectorError('tebra', 'not_configured')
  const sleep = transport.sleep ?? realSleep

  // Serialized spacing gate: concurrent callers queue up rather than all
  // reading the same "last call" timestamp and firing together.
  let lastCallAt = Number.NEGATIVE_INFINITY
  let gate: Promise<void> = Promise.resolve()
  function spaceCalls(): Promise<void> {
    const next = gate.then(async () => {
      const wait = lastCallAt + minIntervalMs - now()
      if (wait > 0) await sleep(wait)
      lastCallAt = now()
    })
    gate = next.catch(() => {})
    return next
  }

  function envelope(operation: string, requestBodyXml: string): string {
    const header = el('RequestHeader', members({ CustomerKey: customerKey, Password: password, User: user }))
    return '<?xml version="1.0" encoding="utf-8"?>' +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="${SCHEMA_NS}">` +
      '<soapenv:Header/><soapenv:Body>' +
      el(operation, el('request', header + requestBodyXml)) +
      '</soapenv:Body></soapenv:Envelope>'
  }

  async function call(operation: string, requestBodyXml: string): Promise<XmlElement> {
    const res = await requestWithRetry(
      'tebra',
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${SOAP_ACTION_PREFIX}${operation}"`, Accept: 'text/xml' },
        body: envelope(operation, requestBodyXml),
      },
      // 500 is NOT retried: WCF reports deterministic SOAP Faults (e.g. a
      // malformed request) as 500, and retrying those just burns quota.
      { retryableStatus: (s) => s === 429 || s === 502 || s === 503 || s === 504, beforeAttempt: spaceCalls },
      { ...transport, sleep },
    )
    if (res.status === 401) throw new EhrConnectorError('tebra', 'auth_failed')
    if (res.status === 403) throw new EhrConnectorError('tebra', 'not_authorized')
    if (res.status !== 200 && res.status !== 500) throw new EhrConnectorError('tebra', 'vendor_error')

    let doc: XmlElement
    try {
      doc = parseXml(res.body)
    } catch {
      throw new EhrConnectorError('tebra', 'invalid_response')
    }
    const body = doc.name === 'Envelope' ? child(doc, 'Body') : null
    if (!body) throw new EhrConnectorError('tebra', 'invalid_response')
    if (child(body, 'Fault') || res.status === 500) throw new EhrConnectorError('tebra', 'vendor_error')

    const result = child(child(body, `${operation}Response`), `${operation}Result`)
    if (!result) throw new EhrConnectorError('tebra', 'invalid_response')

    const flag = (node: XmlElement | null, name: string) => (childText(node, name) ?? '').trim().toLowerCase()
    const security = child(result, 'SecurityResponse')
    if (flag(security, 'CustomerKeyValid') === 'false' || flag(security, 'Authenticated') === 'false') throw new EhrConnectorError('tebra', 'auth_failed')
    if (flag(security, 'Authorized') === 'false') throw new EhrConnectorError('tebra', 'not_authorized')

    const error = child(result, 'ErrorResponse')
    if (flag(error, 'IsError') === 'true') {
      // The vendor message is inspected for classification only and is never
      // propagated (it can name the API user / customer key).
      const vendorMessage = childText(error, 'ErrorMessage') ?? ''
      throw new EhrConnectorError('tebra', /throttl|rate limit|too many/i.test(vendorMessage) ? 'rate_limited' : 'vendor_error')
    }
    return result
  }

  async function getPatients(filter: Record<string, string | undefined>): Promise<FHIRPatient[]> {
    const filterXml = members(filter)
    const result = await call('GetPatients', fieldsXml(PATIENT_FIELDS) + (filterXml ? el('Filter', filterXml) : ''))
    const list = child(result, 'Patients')
    if (isNil(list)) return []
    return childrenNamed(list, 'PatientData').map(mapPatient).filter((p) => p.tebraPatientId !== '')
  }

  async function getPractices(): Promise<Array<{ id: string; name: string; active: boolean }>> {
    const result = await call('GetPractices', fieldsXml(PRACTICE_FIELDS))
    const list = child(result, 'Practices')
    if (isNil(list)) return []
    return childrenNamed(list, 'PracticeData').map((p) => ({
      id: (childText(p, 'ID') ?? '').trim(),
      name: (childText(p, 'PracticeName') ?? '').trim(),
      active: (childText(p, 'Active') ?? 'true').trim().toLowerCase() !== 'false',
    }))
  }

  return {
    supportsClinicalData: false,

    listPatients: () => getPatients({}),

    async searchPatient(name, dob) {
      const [firstName, ...rest] = name.trim().split(/\s+/)
      const lastName = rest.join(' ')
      const dobFilter = ISO_DATE.test(dob) ? dob : undefined
      const candidates = await getPatients({ FirstName: firstName, LastName: lastName || undefined, FromDateOfBirth: dobFilter, ToDateOfBirth: dobFilter })
      return candidates.filter((p) => normName(`${p.firstName} ${p.lastName}`) === normName(name) && p.birthDate === dob)
    },

    async getPatientById(tebraPatientId) {
      // Tebra patient ids are integers; anything else (e.g. a legacy mock id
      // like 'tebra-001') can't exist there.
      if (!/^\d+$/.test(tebraPatientId)) return null
      const result = await call('GetPatient', el('Filter', members({ PatientID: tebraPatientId })))
      const patient = child(result, 'Patient')
      if (isNil(patient) || patient!.children.length === 0) return null
      const mapped = mapPatient(patient!)
      return mapped.tebraPatientId ? mapped : null
    },

    async createPatient(data) {
      const practices = (await getPractices()).filter((p) => p.active && /^\d+$/.test(p.id))
      // Writing a chart into the wrong practice is worse than not writing it.
      if (practices.length !== 1) throw new EhrConnectorError('tebra', 'configuration', 'Tebra account has more than one active practice (or none); Clinsync cannot choose one automatically.')
      if (!ISO_DATE.test(data.birthDate)) throw new EhrConnectorError('tebra', 'configuration', 'Date of birth must be YYYY-MM-DD to create a Tebra chart.')
      const patientXml = members(
        { City: data.city, DateofBirth: `${data.birthDate}T00:00:00`, EmailAddress: data.email, FirstName: data.firstName, LastName: data.lastName, ZipCode: data.zip },
        { Practice: members({ PracticeID: practices[0].id }) },
      )
      const result = await call('CreatePatient', el('Patient', patientXml))
      const id = (childText(result, 'PatientID') ?? '').trim()
      if (!/^\d+$/.test(id) || id === '0') throw new EhrConnectorError('tebra', 'invalid_response')
      return { tebraPatientId: id, ...data }
    },

    getActiveMedications: async () => [],
    getInactiveMedications: async () => [],
    getConditions: async () => [],

    async testConnection() {
      await getPractices()
    },
  }
}

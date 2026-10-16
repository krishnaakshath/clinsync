import type {
  FHIRPatient,
  TebraConnector,
  TebraAppointment,
  TebraCharge,
  InsuranceClaimDetail,
  TebraPayment,
  TebraProvider,
  TebraServiceLocation,
  TebraProcedureCode,
  TebraEncounterDetail,
} from './types'
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
// GetServiceLocations/GetProcedureCodes are the only two operations whose
// Req/Resp/FieldsToReturn types are NOT declared in the main schema (xsd0,
// SCHEMA_NS above) -- the live WSDL imports them from a second schema
// document (?xsd=xsd7) whose target namespace is the same string MINUS the
// trailing slash. Both schemas declare elementFormDefault="qualified", so
// the Fields element (and its boolean child fields) for just these two
// operations must be qualified in THIS namespace, not SCHEMA_NS -- otherwise
// WCF's deserializer treats them as unknown elements (same failure mode as
// the out-of-order members the `members()` helper already guards against)
// and the server sees an empty/missing Fields object.
const SCHEMA_NS_XSD7 = 'http://www.kareo.com/api/schemas'
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
const APPOINTMENT_FIELDS = ['AppointmentReason1', 'ConfirmationStatus', 'EndDate', 'ID', 'PatientID', 'ResourceID1', 'StartDate']
// ChargeData has no inline diagnosis code/description (only the internal
// EncounterDiagnosisID1-4 references) -- see mapCharge(). Primary/Secondary/
// Tertiary *CompanyName/*InsurancePayment/*PaymentCategoryDesc cover the 3
// insurance tiers TebraCharge models.
const CHARGE_FIELDS = [
  'EncounterID', 'ID', 'PatientID',
  'PrimaryInsuranceCompanyName', 'PrimaryInsuranceInsurancePayment', 'PrimaryInsurancePaymentCategoryDesc',
  'ProcedureCode', 'ProcedureName',
  'SecondaryInsuranceCompanyName', 'SecondaryInsuranceInsurancePayment', 'SecondaryInsurancePaymentCategoryDesc',
  'ServiceStartDate', 'Status',
  'TertiaryInsuranceCompanyName', 'TertiaryInsuranceInsurancePayment', 'TertiaryInsurancePaymentCategoryDesc',
  'TotalCharges', 'Units',
]
// PaymentData has no PatientID/ChargeID field at all (confirmed against the
// live schema) -- see mapPayment(). AppointmentID is real and is the only
// available link back to a patient (resolved by the sync orchestrator via
// the same run's already-pulled appointments).
const PAYMENT_FIELDS = ['Amount', 'AppointmentID', 'ID', 'PayerName', 'PayerType', 'PaymentMethod', 'PostDate']
const PROVIDER_FIELDS = ['Degree', 'FullName', 'ID', 'SpecialtyName']
const SERVICE_LOCATION_FIELDS = ['ID', 'Name']
const PROCEDURE_CODE_FIELDS = ['ID', 'OfficialDescription', 'ProcedureCode']
const ENCOUNTER_DETAILS_FIELDS = ['EncounterID', 'EncounterStatus', 'PatientID', 'RenderingProvider', 'ServiceEndDate', 'ServiceLocationID', 'ServiceStartDate']

const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9]*$/
const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

type NsPrefix = 'sch' | 'sch2'

function el(name: string, innerXml: string, prefix: NsPrefix = 'sch'): string {
  // Element names are compile-time constants, but assert anyway so a future
  // caller can't turn a name into an injection point.
  if (!ELEMENT_NAME.test(name)) throw new Error(`invalid SOAP element name: ${name}`)
  return `<${prefix}:${name}>${innerXml}</${prefix}:${name}>`
}
const textEl = (name: string, value: string, prefix: NsPrefix = 'sch') => el(name, escapeXml(value), prefix)

/** WCF DataContract members, alphabetically ordered. Entries with an empty value are omitted. */
function members(entries: Record<string, string | undefined>, raw: Record<string, string> = {}): string {
  const all: Array<[string, string]> = [
    ...Object.entries(entries).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '').map(([k, v]) => [k, textEl(k, v)] as [string, string]),
    ...Object.entries(raw).map(([k, xml]) => [k, el(k, xml)] as [string, string]),
  ]
  return all.sort((a, b) => ordinal(a[0], b[0])).map(([, xml]) => xml).join('')
}

function fieldsXml(names: string[], prefix: NsPrefix = 'sch'): string {
  return el('Fields', [...names].sort(ordinal).map((n) => el(n, 'true', prefix)).join(''), prefix)
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

/**
 * Tebra returns appointment start/end as e.g. "10/20/2026 10:00:00 AM" or
 * "2026-10-20T10:00:00" -- unlike normalizeTebraDate() this keeps the time.
 * Tebra does not report a timezone on these fields (practice-local, not
 * UTC), so no "Z"/offset suffix is added -- callers must not assume UTC.
 */
export function normalizeTebraDateTime(value: string | null): string {
  if (!value) return ''
  const v = value.trim()
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  if (iso) return `${iso[1]}T${iso[2]}`
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i)
  if (us) {
    let hour = parseInt(us[4], 10)
    const ampm = us[7]?.toUpperCase()
    if (ampm === 'PM' && hour !== 12) hour += 12
    if (ampm === 'AM' && hour === 12) hour = 0
    return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${us[5]}:${us[6]}`
  }
  return ''
}

/** Tebra dollar amounts are plain decimal strings (e.g. "150.00"). */
function toCentsOrNull(raw: string | null): number | null {
  if (raw === null) return null
  const v = raw.trim()
  if (v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const APPOINTMENT_STATUS_PATTERNS: Array<[RegExp, TebraAppointment['status']]> = [
  [/cancel/i, 'cancelled'],
  [/no.?show/i, 'no_show'],
  [/(complete|checked.?out|arrived|seen)/i, 'completed'],
]
// ConfirmationStatus is a free-text xs:string in the WSDL (no enumeration),
// so this is a best-effort keyword match, not a confirmed value list.
function mapAppointmentStatus(raw: string): TebraAppointment['status'] {
  for (const [re, status] of APPOINTMENT_STATUS_PATTERNS) if (re.test(raw)) return status
  return 'scheduled'
}

function mapAppointment(a: XmlElement): TebraAppointment {
  const t = (name: string) => (childText(a, name) ?? '').trim()
  return {
    tebraId: t('ID'),
    patientId: t('PatientID'),
    // AppointmentFieldsToReturn has no dedicated ProviderID -- ResourceID1 is
    // Tebra's primary scheduled-resource slot, which the scheduling UI uses
    // for the rendering provider.
    providerId: t('ResourceID1'),
    startsAt: normalizeTebraDateTime(childText(a, 'StartDate')),
    endsAt: normalizeTebraDateTime(childText(a, 'EndDate')),
    visitReason: t('AppointmentReason1'),
    status: mapAppointmentStatus(t('ConfirmationStatus')),
  }
}

function mapCharge(c: XmlElement): TebraCharge {
  const t = (name: string) => (childText(c, name) ?? '').trim()
  const totalCents = toCentsOrNull(childText(c, 'TotalCharges'))
  const insuranceTier = (tier: 'Primary' | 'Secondary' | 'Tertiary'): InsuranceClaimDetail | null => {
    const payerName = t(`${tier}InsuranceCompanyName`)
    if (!payerName) return null
    return {
      payerName,
      // The same charge amount is billed up the payer chain (primary, then
      // secondary, then tertiary) -- ChargeData has no per-tier "billed"
      // amount distinct from the line's own TotalCharges.
      billedAmountCents: totalCents ?? 0,
      paidAmountCents: toCentsOrNull(childText(c, `${tier}InsuranceInsurancePayment`)),
      status: t(`${tier}InsurancePaymentCategoryDesc`),
    }
  }
  const procedureCode = t('ProcedureCode')
  return {
    tebraId: t('ID'),
    patientId: t('PatientID'),
    encounterId: t('EncounterID') || null,
    dateOfService: normalizeTebraDate(childText(c, 'ServiceStartDate')),
    // SOAP 2.1 ChargeData exposes only internal diagnosis references
    // (EncounterDiagnosisID1-4), never an inline ICD code + description, so
    // this is always empty rather than guessed.
    diagnosisCodes: [],
    procedureCodes: procedureCode
      ? [{ code: procedureCode, description: t('ProcedureName'), units: parseInt(t('Units'), 10) || 0, chargeCents: totalCents ?? 0 }]
      : [],
    amountCents: totalCents ?? 0,
    status: t('Status'),
    primaryInsurance: insuranceTier('Primary'),
    secondaryInsurance: insuranceTier('Secondary'),
    tertiaryInsurance: insuranceTier('Tertiary'),
  }
}

function mapPayment(p: XmlElement): TebraPayment {
  const t = (name: string) => (childText(p, name) ?? '').trim()
  return {
    tebraId: t('ID'),
    // PaymentData has no PatientID/ChargeID (confirmed against the live
    // schema -- payments are tracked at the payer/batch level, not joined to
    // a patient or charge by this operation), so these are never guessed.
    patientId: '',
    chargeId: null,
    appointmentId: t('AppointmentID') || null,
    payerName: t('PayerName'),
    payerType: t('PayerType'),
    amountCents: toCentsOrNull(childText(p, 'Amount')) ?? 0,
    method: t('PaymentMethod'),
    postedDate: normalizeTebraDate(childText(p, 'PostDate')),
  }
}

function mapProvider(p: XmlElement): TebraProvider {
  const t = (name: string) => (childText(p, name) ?? '').trim()
  return { tebraId: t('ID'), name: t('FullName'), credentials: t('Degree') || null, specialty: t('SpecialtyName') }
}

function mapServiceLocation(s: XmlElement): TebraServiceLocation {
  return { tebraId: (childText(s, 'ID') ?? '').trim(), name: (childText(s, 'Name') ?? '').trim() }
}

function mapProcedureCode(p: XmlElement): TebraProcedureCode {
  const t = (name: string) => (childText(p, name) ?? '').trim()
  return { tebraId: t('ID'), code: t('ProcedureCode'), description: t('OfficialDescription') }
}

function mapEncounterDetail(e: XmlElement): TebraEncounterDetail {
  const t = (name: string) => (childText(e, name) ?? '').trim()
  return {
    tebraId: t('EncounterID'),
    patientId: t('PatientID'),
    // EncounterDetailsFieldsToReturn has no RenderingProviderID (unlike
    // ChargeFieldsToReturn's ID/Name pair) -- RenderingProvider is the
    // provider's display name, not a numeric Tebra provider id.
    providerId: t('RenderingProvider'),
    serviceLocationId: t('ServiceLocationID'),
    serviceStartDate: normalizeTebraDate(childText(e, 'ServiceStartDate')),
    serviceEndDate: normalizeTebraDate(childText(e, 'ServiceEndDate')),
    status: t('EncounterStatus'),
  }
}

export const TEBRA_INVALID_CUSTOMER_KEY_MESSAGE = 'Tebra rejected the customer key. Copy it again from Tebra (Settings → Get Customer Key) and re-enter it in Settings → EHR Connections.'
export const TEBRA_BAD_LOGIN_MESSAGE = 'Tebra accepted the customer key but rejected the API user or password. Re-enter them in Settings → EHR Connections.'

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
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="${SCHEMA_NS}" xmlns:sch2="${SCHEMA_NS_XSD7}">` +
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
    // Two different fixes for the admin, so two different (fixed) messages:
    // a bad customer key is checked before the user/password, and Tebra
    // reports it with CustomerKeyValid=false.
    if (flag(security, 'CustomerKeyValid') === 'false') throw new EhrConnectorError('tebra', 'auth_failed', TEBRA_INVALID_CUSTOMER_KEY_MESSAGE)
    if (flag(security, 'Authenticated') === 'false') throw new EhrConnectorError('tebra', 'auth_failed', TEBRA_BAD_LOGIN_MESSAGE)
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
    // Filter is always sent, even empty: verified against the live service,
    // GetPatients without a Filter element fails server-side with a
    // NullReferenceException in date validation (before authentication).
    const result = await call('GetPatients', fieldsXml(PATIENT_FIELDS) + el('Filter', members(filter)))
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

  async function getAppointments(filter: { fromLastModifiedDate?: string }): Promise<TebraAppointment[]> {
    const result = await call('GetAppointments', fieldsXml(APPOINTMENT_FIELDS) + el('Filter', members({ FromLastModifiedDate: filter.fromLastModifiedDate })))
    const list = child(result, 'Appointments')
    if (isNil(list)) return []
    return childrenNamed(list, 'AppointmentData').map(mapAppointment).filter((a) => a.tebraId !== '')
  }

  async function getCharges(filter: { fromLastModifiedDate?: string }): Promise<TebraCharge[]> {
    const result = await call('GetCharges', fieldsXml(CHARGE_FIELDS) + el('Filter', members({ FromLastModifiedDate: filter.fromLastModifiedDate })))
    const list = child(result, 'Charges')
    if (isNil(list)) return []
    return childrenNamed(list, 'ChargeData').map(mapCharge).filter((c) => c.tebraId !== '')
  }

  async function getPayments(filter: { fromLastModifiedDate?: string }): Promise<TebraPayment[]> {
    const result = await call('GetPayments', fieldsXml(PAYMENT_FIELDS) + el('Filter', members({ FromLastModifiedDate: filter.fromLastModifiedDate })))
    const list = child(result, 'Payments')
    if (isNil(list)) return []
    return childrenNamed(list, 'PaymentData').map(mapPayment).filter((p) => p.tebraId !== '')
  }

  async function getProviders(): Promise<TebraProvider[]> {
    const result = await call('GetProviders', fieldsXml(PROVIDER_FIELDS))
    const list = child(result, 'Providers')
    if (isNil(list)) return []
    return childrenNamed(list, 'ProviderData').map(mapProvider).filter((p) => p.tebraId !== '')
  }

  async function getServiceLocations(): Promise<TebraServiceLocation[]> {
    // GetServiceLocationsReq's Fields live in the xsd7 schema -- see SCHEMA_NS_XSD7.
    const result = await call('GetServiceLocations', fieldsXml(SERVICE_LOCATION_FIELDS, 'sch2'))
    const list = child(result, 'ServiceLocations')
    if (isNil(list)) return []
    return childrenNamed(list, 'ServiceLocationData').map(mapServiceLocation).filter((s) => s.tebraId !== '')
  }

  async function getProcedureCodes(): Promise<TebraProcedureCode[]> {
    // GetProcedureCodesReq's Fields live in the xsd7 schema -- see SCHEMA_NS_XSD7.
    const result = await call('GetProcedureCodes', fieldsXml(PROCEDURE_CODE_FIELDS, 'sch2'))
    const list = child(result, 'ProcedureCodes')
    if (isNil(list)) return []
    return childrenNamed(list, 'ProcedureCodeData').map(mapProcedureCode).filter((p) => p.tebraId !== '')
  }

  async function getEncounterDetails(encounterId: string): Promise<TebraEncounterDetail | null> {
    // EncounterDetailsFilter only accepts EncounterID/Practice -- no date
    // range -- and, unlike GetPatients/GetAppointments/etc., Filter itself is
    // required (minOccurs=1) on GetEncounterDetailsReq.
    const result = await call('GetEncounterDetails', fieldsXml(ENCOUNTER_DETAILS_FIELDS) + el('Filter', members({ EncounterID: encounterId })))
    const list = child(result, 'EncounterDetails')
    if (isNil(list)) return null
    const first = childrenNamed(list, 'EncounterDetailsData')[0]
    if (!first) return null
    const mapped = mapEncounterDetail(first)
    return mapped.tebraId ? mapped : null
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

    getAppointments,
    getCharges,
    getPayments,
    getProviders,
    getServiceLocations,
    getProcedureCodes,
    getEncounterDetails,

    async testConnection() {
      await getPractices()
    },
  }
}

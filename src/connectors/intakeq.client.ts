import type { IntakeQClient, IntakeQConnector, IntakeQIntake } from './types'
import { EhrConnectorError } from './errors'
import { requestWithRetry, type TransportOptions } from './http'

// Real IntakeQ (PracticeQ) REST client.
// Docs: https://support.intakeq.com/article/251-intakeq-client-api and
//       https://support.intakeq.com/article/31-intakeq-api
//  - Base URL https://intakeq.com/api/v1, auth via the `X-Auth-Key` header.
//  - GET /clients?search=&page=&includeProfile=true -- max 100 per page.
//  - GET /intakes/summary?clientId= -- submitted intakes only by default.
//  - GET /intakes/{id} -- full intake with Questions[] and ConsentForms[].
//  - Standard plan limit: 10 requests/minute, 500/day. 429s are retried
//    (honouring Retry-After) up to the transport's attempt limit.
//
// Relative imports only (no `@/`): scripts/ehr-connection-check.mjs loads
// this file directly via tsx, outside the Next.js/Vitest alias setup.

export const INTAKEQ_BASE_URL = 'https://intakeq.com/api/v1'
const PAGE_SIZE = 100
const DEFAULT_MAX_PAGES = 200 // 20,000 clients -- a runaway-pagination backstop, not a business limit

export interface IntakeQClientOptions extends TransportOptions {
  apiKey: string
  baseUrl?: string
  maxPages?: number
}

// Shapes of the subset of IntakeQ's JSON this client reads. Everything is
// optional/nullable because it comes off the wire.
interface ApiClient {
  ClientId?: number | string | null
  Name?: string | null
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  Phone?: string | null
  MobilePhone?: string | null
  HomePhone?: string | null
  DateOfBirth?: number | string | null
  City?: string | null
  PostalCode?: string | null
}
interface ApiIntakeSummary {
  Id?: string | null
  ClientId?: number | string | null
  Status?: string | null
  DateCreated?: number | null
  DateSubmitted?: number | null
}
interface ApiQuestion {
  Text?: string | null
  Answer?: string | null
}
interface ApiFullIntake extends ApiIntakeSummary {
  Questions?: ApiQuestion[] | null
  ConsentForms?: Array<{ Signed?: boolean | null; Status?: string | null; DateSubmitted?: number | null }> | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** IntakeQ dates are Unix epoch milliseconds; DOB is a calendar date, so read it in UTC. */
export function epochMsToIsoDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return new Date(Number(value)).toISOString().slice(0, 10)
  return ''
}

function mapClient(c: ApiClient): IntakeQClient {
  let firstName = str(c.FirstName)
  let lastName = str(c.LastName)
  if (!firstName && !lastName && str(c.Name)) {
    const [first, ...rest] = str(c.Name).split(/\s+/)
    firstName = first
    lastName = rest.join(' ')
  }
  return {
    clientId: str(c.ClientId),
    firstName,
    lastName,
    dateOfBirth: epochMsToIsoDate(c.DateOfBirth),
    city: str(c.City),
    zip: str(c.PostalCode),
    phone: str(c.Phone) || str(c.MobilePhone) || str(c.HomePhone),
    email: str(c.Email),
  }
}

// Intake questionnaires are authored per practice, so there is no fixed
// field for "referral type" etc. -- answers are located by question text.
// Best-effort and documented in docs/ehr-connections.md; a question that
// doesn't match simply leaves the field empty.
const RATING_SCALES: Array<{ name: string; re: RegExp }> = [
  { name: 'PHQ-9', re: /\bPHQ-?9\b/i },
  { name: 'GAD-7', re: /\bGAD-?7\b/i },
  { name: 'PCL-5', re: /\bPCL-?5\b/i },
  { name: 'MDQ', re: /\bMDQ\b/i },
]

function findAnswer(questions: ApiQuestion[], re: RegExp): string {
  const q = questions.find((x) => re.test(str(x.Text)) && str(x.Answer) !== '')
  return q ? str(q.Answer) : ''
}

export function mapIntake(full: ApiFullIntake): IntakeQIntake {
  const questions = Array.isArray(full.Questions) ? full.Questions : []
  const submitted = epochMsToIsoDate(full.DateSubmitted ?? full.DateCreated)
  const ratingScales: IntakeQIntake['ratingScales'] = []
  for (const scale of RATING_SCALES) {
    const q = questions.find((x) => scale.re.test(str(x.Text)) && /score|total/i.test(str(x.Text)) && /^\d+(\.\d+)?$/.test(str(x.Answer)))
    if (q) ratingScales.push({ name: scale.name, score: Number(str(q.Answer)), date: submitted })
  }
  const consentForms = Array.isArray(full.ConsentForms) ? full.ConsentForms : []
  return {
    intakeId: str(full.Id),
    clientId: str(full.ClientId),
    referralType: findAnswer(questions, /referr/i),
    availability: findAnswer(questions, /availab/i),
    consentSigned: consentForms.length > 0 && consentForms.some((f) => f.Signed === true || /signed|submitted/i.test(str(f.Status))),
    consentPreference: findAnswer(questions, /(prefer\w*.*contact|contact.*prefer\w*)/i),
    ratingScales,
  }
}

export function createIntakeQClient(options: IntakeQClientOptions): IntakeQConnector {
  const { apiKey, baseUrl = INTAKEQ_BASE_URL, maxPages = DEFAULT_MAX_PAGES, ...transport } = options
  if (!apiKey) throw new EhrConnectorError('intakeq', 'not_configured')

  /** GET a JSON resource. Returns null for 404. */
  async function getJson<T>(pathAndQuery: string): Promise<T | null> {
    const res = await requestWithRetry(
      'intakeq',
      `${baseUrl}${pathAndQuery}`,
      { method: 'GET', headers: { 'X-Auth-Key': apiKey, Accept: 'application/json' } },
      { retryableStatus: (s) => s === 429 || (s >= 500 && s <= 599) },
      transport,
    )
    if (res.status === 404) return null
    if (res.status === 401) throw new EhrConnectorError('intakeq', 'auth_failed')
    if (res.status === 403) throw new EhrConnectorError('intakeq', 'not_authorized')
    if (res.status < 200 || res.status >= 300) throw new EhrConnectorError('intakeq', 'vendor_error')
    try {
      return JSON.parse(res.body) as T
    } catch {
      throw new EhrConnectorError('intakeq', 'invalid_response')
    }
  }

  async function getArray<T>(pathAndQuery: string): Promise<T[]> {
    const data = await getJson<unknown>(pathAndQuery)
    if (data === null) return []
    if (!Array.isArray(data)) throw new EhrConnectorError('intakeq', 'invalid_response')
    return data as T[]
  }

  async function getFullIntake(intakeId: string): Promise<IntakeQIntake | null> {
    if (!intakeId) return null
    const full = await getJson<ApiFullIntake>(`/intakes/${encodeURIComponent(intakeId)}`)
    if (full === null) return null
    if (typeof full !== 'object' || Array.isArray(full)) throw new EhrConnectorError('intakeq', 'invalid_response')
    return mapIntake(full)
  }

  return {
    async listClients() {
      const all: IntakeQClient[] = []
      for (let page = 1; page <= maxPages; page++) {
        const batch = await getArray<ApiClient>(`/clients?includeProfile=true&page=${page}`)
        all.push(...batch.map(mapClient))
        if (batch.length < PAGE_SIZE) return all
      }
      return all
    },

    async getClient(clientId) {
      // IntakeQ client ids are numeric; anything else (e.g. a legacy mock id
      // like 'iq-001') can't exist there, so don't spend a request on it.
      if (!/^\d+$/.test(clientId)) return null
      const matches = await getArray<ApiClient>(`/clients?search=${encodeURIComponent(clientId)}&includeProfile=true`)
      const hit = matches.find((c) => str(c.ClientId) === clientId)
      return hit ? mapClient(hit) : null
    },

    async getIntakeByClientId(clientId) {
      if (!/^\d+$/.test(clientId)) return null
      const summaries = await getArray<ApiIntakeSummary>(`/intakes/summary?clientId=${encodeURIComponent(clientId)}`)
      const latest = summaries
        .filter((s) => str(s.Id) !== '')
        .sort((a, b) => (b.DateSubmitted ?? b.DateCreated ?? 0) - (a.DateSubmitted ?? a.DateCreated ?? 0))[0]
      return latest ? getFullIntake(str(latest.Id)) : null
    },

    getFullIntake,

    async testConnection() {
      // A name search that matches nobody: proves the key works with one
      // request and moves no patient data.
      await getArray<ApiClient>(`/clients?search=${encodeURIComponent('clinsync-connection-test-zzzz')}`)
    },
  }
}

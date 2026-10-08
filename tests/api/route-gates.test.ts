import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Role, Session } from '@/lib/auth'

// Route-gate harness: one row per exported API handler. Every handler under
// src/app/api must have a row (the completeness test fails otherwise), and
// each row's gate is exercised without a database:
//  - staff routes return 401 with no session, before any DB work;
//  - role-gated routes return exactly 403 {error:'Forbidden'} for every role
//    not allowed, BEFORE the body is parsed (the request carries a
//    malformed body, so a parse-first handler would answer 400 instead);
//  - patient-portal routes return 401 with no patient session.
// The DB client is replaced by one that throws, so a gate that runs after a
// query fails loudly here.

let currentSession: Session | null = null
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  const getSession = vi.fn(async () => currentSession)
  return {
    ...actual,
    getSession,
    requireSession: vi.fn(async () => currentSession ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })),
  }
})
vi.mock('@/lib/patient-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/patient-session')>('@/lib/patient-session')
  return {
    ...actual,
    getPatientSession: vi.fn(async () => null),
    requirePatientSession: vi.fn(async () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })),
  }
})
const dbTouched = vi.fn()
vi.mock('@/db/client', () => ({
  getDb: () => {
    dbTouched()
    throw new Error('database touched before the route gate')
  },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Access = 'public' | 'patient' | 'staff' | 'staff-or-patient' | readonly Role[]

const ALL: readonly Role[] = ['admin', 'crc', 'pi']
const OPS: readonly Role[] = ['admin', 'crc']
const ADMIN: readonly Role[] = ['admin']
const PI_ADMIN: readonly Role[] = ['pi', 'admin']

// [route path under src/app/api, method, who may call it]
const ROWS: [string, Method, Access][] = [
  ['account/mfa/reset', 'POST', 'staff'],
  ['appointments', 'GET', 'staff'],
  ['appointments', 'POST', 'staff'],
  ['appointments/[id]', 'PUT', 'staff'],
  ['audit-log', 'GET', OPS],
  ['broadcasts', 'GET', OPS],
  ['broadcasts', 'POST', OPS],
  ['broadcasts/[id]', 'GET', OPS],
  ['broadcasts/recipients', 'GET', OPS],
  ['charges', 'GET', OPS],
  ['charges', 'POST', OPS],
  ['charges/[id]', 'GET', OPS],
  ['charges/[id]', 'PATCH', OPS],
  ['discrepancies/[id]/resolve', 'POST', OPS],
  ['documents/[id]', 'PATCH', OPS],
  ['form-submissions', 'GET', 'staff'],
  ['form-submissions', 'POST', OPS],
  ['form-submissions/[id]', 'GET', 'staff'],
  ['form-submissions/[id]', 'PUT', OPS],
  ['form-templates', 'GET', OPS],
  ['form-templates', 'POST', OPS],
  ['form-templates/[id]', 'GET', OPS],
  ['form-templates/[id]', 'PUT', OPS],
  ['identity-matches', 'GET', OPS],
  ['identity-matches/[id]/confirm', 'POST', OPS],
  ['identity-matches/[id]/reject', 'POST', OPS],
  ['intake/[token]', 'GET', 'public'],
  ['intake/[token]', 'PUT', 'public'],
  ['login', 'POST', 'public'],
  ['login/mfa', 'POST', 'public'],
  ['logout', 'POST', 'public'],
  ['messages/[patientId]', 'GET', 'staff-or-patient'],
  ['messages/[patientId]', 'POST', 'staff-or-patient'],
  ['mock-payments', 'POST', OPS],
  ['patient-portal/account/mfa/confirm', 'POST', 'patient'],
  ['patient-portal/account/mfa/enroll', 'POST', 'patient'],
  ['patient-portal/account/mfa/reset', 'POST', 'patient'],
  ['patient-portal/login', 'POST', 'public'],
  ['patient-portal/login/mfa', 'POST', 'public'],
  ['patient-portal/logout', 'POST', 'public'],
  ['patient-portal/medications-export', 'GET', 'patient'],
  ['patients', 'GET', 'staff'],
  ['patients', 'POST', OPS],
  ['patients/[anonId]', 'GET', 'staff'],
  ['patients/[anonId]', 'DELETE', ADMIN],
  ['patients/[anonId]/identity', 'PUT', OPS],
  ['patients/[anonId]/portal-password', 'POST', ADMIN],
  ['patients/[anonId]/portal-password', 'DELETE', ADMIN],
  ['patients/[anonId]/refresh', 'POST', 'staff'],
  ['patients/[anonId]/reset-mfa', 'POST', ADMIN],
  ['providers/[id]', 'PUT', ADMIN],
  ['reviews', 'GET', OPS],
  ['reviews', 'POST', OPS],
  ['reviews/[id]', 'GET', OPS],
  ['reviews/[id]', 'PUT', OPS],
  ['search', 'GET', 'staff'],
  ['settings/auto-classify', 'PUT', ADMIN],
  ['settings/ehr-connections', 'PUT', ADMIN],
  ['settings/ehr-connections/sync', 'POST', ADMIN],
  ['settings/ehr-connections/test', 'POST', ADMIN],
  ['settings/practice-info', 'PUT', ADMIN],
  ['trials', 'GET', 'staff'],
  ['trials/[trialId]/criteria', 'PUT', PI_ADMIN],
  ['users', 'GET', ADMIN],
  ['users', 'POST', ADMIN],
  ['users/[id]/reset-mfa', 'POST', ADMIN],
  ['workbook/export', 'GET', 'staff'],
  ['workbook/full', 'GET', OPS],
]

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const modules = import.meta.glob('/src/app/api/**/route.ts')
const keyFor = (route: string) => `/src/app/api/${route}/route.ts`

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
async function handler(route: string, method: Method): Promise<Handler> {
  const load = modules[keyFor(route)]
  if (!load) throw new Error(`no route module for ${route}`)
  const mod = (await load()) as Record<string, unknown>
  return mod[method] as Handler
}

const ctx = { params: Promise.resolve({ id: '2147483000', anonId: 'RD-NOPE', patientId: 'RD-NOPE', trialId: 'no-such-trial', token: 'no-such-token' }) }
function request(method: Method): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
  }
  if (method !== 'GET') init.body = '{not json'
  return new NextRequest('http://localhost/api/x', init)
}

beforeEach(() => {
  currentSession = null
  dbTouched.mockClear()
})

describe('API route gate harness', () => {
  it('has exactly one row per exported handler under src/app/api', async () => {
    const exported: string[] = []
    for (const [key, load] of Object.entries(modules)) {
      const mod = (await load()) as Record<string, unknown>
      const route = key.replace('/src/app/api/', '').replace(/\/route\.ts$/, '')
      for (const m of METHODS) if (typeof mod[m] === 'function') exported.push(`${m} ${route}`)
    }
    const rows = ROWS.map(([route, m]) => `${m} ${route}`)
    expect(new Set(rows).size).toBe(rows.length)
    expect([...rows].sort()).toEqual(exported.sort())
  })

  const staffRows = ROWS.filter(([, , a]) => a === 'staff' || Array.isArray(a))
  it.each(staffRows.map(([r, m]) => [`${m} ${r}`, r, m] as const))('%s -> 401 without a staff session', async (_n, route, method) => {
    const res = await (await handler(route, method))(request(method), ctx)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(dbTouched).not.toHaveBeenCalled()
  })

  const denied = ROWS.flatMap(([route, method, access]) =>
    Array.isArray(access) ? ALL.filter((r) => !access.includes(r)).map((role) => [`${method} ${route}`, role, route, method] as const) : [],
  )
  it.each(denied)('%s -> exact 403 {error:"Forbidden"} for %s, before parsing or DB', async (_n, role, route, method) => {
    currentSession = { role, name: 'Gate Test' }
    const res = await (await handler(route, method))(request(method), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(dbTouched).not.toHaveBeenCalled()
  })

  const patientRows = ROWS.filter(([, , a]) => a === 'patient' || a === 'staff-or-patient')
  it.each(patientRows.map(([r, m]) => [`${m} ${r}`, r, m] as const))('%s -> 401 with no session at all, before parsing', async (_n, route, method) => {
    const res = await (await handler(route, method))(request(method), ctx)
    expect(res.status).toBe(401)
    expect(dbTouched).not.toHaveBeenCalled()
  })
})

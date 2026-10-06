import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A body that isn't JSON at all used to make `await request.json()` throw
// inside these handlers -> unhandled 500 (seen live against a production
// build). It's a client error: each route must answer with its normal 400.
// Every request below is rejected before any DB write (and the admin
// session clears every role gate so the parse step is what's exercised).
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  const admin = { role: 'admin' as const, name: 'Test Admin' }
  return { ...actual, requireSession: vi.fn(async () => admin), getSession: vi.fn(async () => admin) }
})

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const ctx = { params: Promise.resolve({ id: '2147483000', anonId: 'RD-ZZZZ', patientId: 'RD-ZZZZ', trialId: 'probe-no-trial' }) }
const bad = (method: string) => new NextRequest('http://localhost/api/x', { method, body: 'not json{', headers: { 'content-type': 'application/json', origin: 'http://localhost' } })

const CASES: [string, string, () => Promise<Record<string, unknown>>][] = [
  ['POST', 'appointments', () => import('@/app/api/appointments/route')],
  ['PUT', 'appointments/[id]', () => import('@/app/api/appointments/[id]/route')],
  ['POST', 'broadcasts', () => import('@/app/api/broadcasts/route')],
  ['POST', 'charges', () => import('@/app/api/charges/route')],
  ['PATCH', 'charges/[id]', () => import('@/app/api/charges/[id]/route')],
  ['PATCH', 'documents/[id]', () => import('@/app/api/documents/[id]/route')],
  ['POST', 'form-submissions', () => import('@/app/api/form-submissions/route')],
  ['PUT', 'form-submissions/[id]', () => import('@/app/api/form-submissions/[id]/route')],
  ['POST', 'form-templates', () => import('@/app/api/form-templates/route')],
  ['PUT', 'form-templates/[id]', () => import('@/app/api/form-templates/[id]/route')],
  ['POST', 'messages/[patientId]', () => import('@/app/api/messages/[patientId]/route')],
  ['POST', 'mock-payments', () => import('@/app/api/mock-payments/route')],
  ['POST', 'patients', () => import('@/app/api/patients/route')],
  ['PUT', 'patients/[anonId]/identity', () => import('@/app/api/patients/[anonId]/identity/route')],
  ['PUT', 'providers/[id]', () => import('@/app/api/providers/[id]/route')],
  ['POST', 'reviews', () => import('@/app/api/reviews/route')],
  ['PUT', 'reviews/[id]', () => import('@/app/api/reviews/[id]/route')],
  ['PUT', 'settings/auto-classify', () => import('@/app/api/settings/auto-classify/route')],
  ['PUT', 'settings/practice-info', () => import('@/app/api/settings/practice-info/route')],
  ['POST', 'users', () => import('@/app/api/users/route')],
]

describe('malformed JSON body -> 400, not 500', () => {
  it.each(CASES)('%s /api/%s', async (method, _path, load) => {
    const handler = (await load())[method] as Handler
    const res = await handler(bad(method), ctx)
    expect(res.status).toBe(400)
  })
})

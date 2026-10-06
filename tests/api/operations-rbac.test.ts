import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'

// The JSON API behind every operations-only page (LeftNav: admin + crc) must
// refuse a PI session the same way the page does -- a live probe against a
// production build showed every one of these returning 200 to PI. The role
// check must run before any body parsing or DB work, so every request below
// uses a bogus id and an empty body: a 403 is the only acceptable answer.
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'pi' as const, name: 'Dr. Test' })) }
})

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

const BOGUS_ID = '2147483000'
const ctx = { params: Promise.resolve({ id: BOGUS_ID }) }
const url = 'http://localhost/api/x'
const get = () => new NextRequest(url, { headers: { origin: 'http://localhost' } })
const write = (method: string) => new NextRequest(url, { method, body: '{}', headers: { origin: 'http://localhost', 'content-type': 'application/json' } })

const CASES: [string, () => Promise<Handler>, () => NextRequest][] = [
  ['GET /api/broadcasts', async () => (await import('@/app/api/broadcasts/route')).GET as unknown as Handler, get],
  ['POST /api/broadcasts', async () => (await import('@/app/api/broadcasts/route')).POST as unknown as Handler, () => write('POST')],
  ['GET /api/broadcasts/[id]', async () => (await import('@/app/api/broadcasts/[id]/route')).GET as unknown as Handler, get],
  ['GET /api/broadcasts/recipients', async () => (await import('@/app/api/broadcasts/recipients/route')).GET as unknown as Handler, get],
  ['GET /api/charges', async () => (await import('@/app/api/charges/route')).GET as unknown as Handler, get],
  ['POST /api/charges', async () => (await import('@/app/api/charges/route')).POST as unknown as Handler, () => write('POST')],
  ['GET /api/charges/[id]', async () => (await import('@/app/api/charges/[id]/route')).GET as unknown as Handler, get],
  ['PATCH /api/charges/[id]', async () => (await import('@/app/api/charges/[id]/route')).PATCH as unknown as Handler, () => write('PATCH')],
  ['POST /api/mock-payments', async () => (await import('@/app/api/mock-payments/route')).POST as unknown as Handler, () => write('POST')],
  ['PATCH /api/documents/[id]', async () => (await import('@/app/api/documents/[id]/route')).PATCH as unknown as Handler, () => write('PATCH')],
  ['GET /api/form-templates', async () => (await import('@/app/api/form-templates/route')).GET as unknown as Handler, get],
  ['POST /api/form-templates', async () => (await import('@/app/api/form-templates/route')).POST as unknown as Handler, () => write('POST')],
  ['GET /api/form-templates/[id]', async () => (await import('@/app/api/form-templates/[id]/route')).GET as unknown as Handler, get],
  ['PUT /api/form-templates/[id]', async () => (await import('@/app/api/form-templates/[id]/route')).PUT as unknown as Handler, () => write('PUT')],
  ['GET /api/identity-matches', async () => (await import('@/app/api/identity-matches/route')).GET as unknown as Handler, get],
  ['POST /api/identity-matches/[id]/confirm', async () => (await import('@/app/api/identity-matches/[id]/confirm/route')).POST as unknown as Handler, () => write('POST')],
  ['POST /api/identity-matches/[id]/reject', async () => (await import('@/app/api/identity-matches/[id]/reject/route')).POST as unknown as Handler, () => write('POST')],
  ['GET /api/reviews', async () => (await import('@/app/api/reviews/route')).GET as unknown as Handler, get],
  ['POST /api/reviews', async () => (await import('@/app/api/reviews/route')).POST as unknown as Handler, () => write('POST')],
  ['GET /api/reviews/[id]', async () => (await import('@/app/api/reviews/[id]/route')).GET as unknown as Handler, get],
  ['PUT /api/reviews/[id]', async () => (await import('@/app/api/reviews/[id]/route')).PUT as unknown as Handler, () => write('PUT')],
  ['GET /api/workbook/full', async () => (await import('@/app/api/workbook/full/route')).GET as unknown as Handler, get],
]

describe('operations-only API routes refuse a PI session', () => {
  it.each(CASES)('%s -> 403 for pi', async (_name, load, req) => {
    const handler = await load()
    const res = await handler(req(), ctx)
    expect(res.status).toBe(403)
  })

  it('still lets a coordinator through the role gate (bogus charge id -> 404, not 403)', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const { GET } = await import('@/app/api/charges/[id]/route')
    const res = await GET(get(), ctx)
    expect(res.status).toBe(404)
  })
})

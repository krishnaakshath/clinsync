import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'

// Owner decision: sending an intake form, changing a form submission's
// status, and resolving a form-vs-chart discrepancy are admin/crc actions.
// A PI gets 403 from the API itself (the role check runs before body parsing
// or DB work -- so a bogus id and an empty body must still yield 403), not
// just a hidden button.
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'pi' as const, name: 'Dr. Test' })) }
})

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const ctx = { params: Promise.resolve({ id: '2147483000' }) }
const write = (method: string) => new NextRequest('http://localhost/api/x', { method, body: '{}', headers: { origin: 'http://localhost', 'content-type': 'application/json' } })

const CASES: [string, () => Promise<Handler>, number][] = [
  ['POST /api/form-submissions (send form)', async () => (await import('@/app/api/form-submissions/route')).POST as unknown as Handler, 400],
  ['PUT /api/form-submissions/[id] (status change)', async () => (await import('@/app/api/form-submissions/[id]/route')).PUT as unknown as Handler, 400],
  ['POST /api/discrepancies/[id]/resolve', async () => (await import('@/app/api/discrepancies/[id]/resolve/route')).POST as unknown as Handler, 404],
]

describe('intake write actions are admin/crc only', () => {
  it.each(CASES)('%s -> 403 for pi', async (_n, load) => {
    const res = await (await load())(write('POST'), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it.each(CASES.flatMap(([n, l, s]) => (['admin', 'crc'] as const).map((r) => [n, r, l, s] as const)))('%s passes the role gate for %s', async (_n, role, load, expected) => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role, name: 'Test' })
    const res = await (await load())(write('POST'), ctx)
    expect(res.status).toBe(expected)
  })
})

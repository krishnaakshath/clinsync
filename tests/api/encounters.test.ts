import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET, POST } from '@/app/api/encounters/route'
import { GET as getOne } from '@/app/api/encounters/[id]/route'
import { listActiveProviders } from '@/lib/queries/providers'
import { getDb } from '@/db/client'
import { encounters } from '@/db/schema'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'pi', name: 'Dr. Gate Test' })) }))

// Every POST in this file inserts a real encounter into the shared dev DB --
// same cleanup discipline as tests/api/appointments.test.ts: track and
// delete each one created, since seed()'s guard against destructive
// reseeds means these rows would otherwise accumulate permanently.
const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) {
    const id = createdIds.pop()!
    await getDb().delete(encounters).where(eq(encounters.id, id))
  }
})

// No FK on encounters.serviceLocationId (see src/lib/queries/encounters.ts's
// doc comment on upsertEncounterFromTebra) -- any positive int is valid here,
// collision-resistant via Date.now() so parallel test runs never collide.
function serviceLocationId() {
  return Date.now() % 1_000_000
}

describe('POST /api/encounters', () => {
  it('rejects a payload missing required fields', async () => {
    const req = new Request('http://localhost/api/encounters', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a new encounter tagged source: clinsync, tebraId: null', async () => {
    const providers = await listActiveProviders()
    const req = new Request('http://localhost/api/encounters', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0001',
        providerId: providers[0].id,
        serviceLocationId: serviceLocationId(),
        serviceStartDate: '2026-10-01',
        serviceEndDate: '2026-10-01',
        status: 'scheduled',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdIds.push(body.id)
    expect(body.source).toBe('clinsync')
    expect(body.tebraId).toBeNull()
    expect(body.status).toBe('scheduled')
  })
})

describe('GET /api/encounters/[id]', () => {
  it('returns the created encounter, round-tripping source: clinsync', async () => {
    const providers = await listActiveProviders()
    const createReq = new Request('http://localhost/api/encounters', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0002',
        providerId: providers[0].id,
        serviceLocationId: serviceLocationId(),
        serviceStartDate: '2026-10-02',
        serviceEndDate: '2026-10-02',
        status: 'scheduled',
      }),
    })
    const created = await (await POST(createReq as never)).json()
    createdIds.push(created.id)

    const res = await getOne(new Request('http://localhost') as never, { params: Promise.resolve({ id: String(created.id) }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe(created.id)
    expect(body.source).toBe('clinsync')
  })

  it('returns 404 for a nonexistent encounter', async () => {
    const res = await getOne(new Request('http://localhost') as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/encounters', () => {
  it('lists the created encounter', async () => {
    const providers = await listActiveProviders()
    const createReq = new Request('http://localhost/api/encounters', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0003',
        providerId: providers[0].id,
        serviceLocationId: serviceLocationId(),
        serviceStartDate: '2026-10-03',
        serviceEndDate: '2026-10-03',
        status: 'scheduled',
      }),
    })
    const created = await (await POST(createReq as never)).json()
    createdIds.push(created.id)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.some((e: { id: number }) => e.id === created.id)).toBe(true)
  })
})

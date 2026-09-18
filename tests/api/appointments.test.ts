import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET, POST } from '@/app/api/appointments/route'
import { PUT } from '@/app/api/appointments/[id]/route'
import { listActiveProviders } from '@/lib/queries/providers'
import { getDb } from '@/db/client'
import { appointments } from '@/db/schema'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// Every POST in this file inserts a real appointment into the shared dev DB
// -- this file was previously missing cleanup entirely, and running the
// suite repeatedly left 30+ duplicate "Test visit" appointments per patient
// on RD-0001 through RD-0004. Track and delete each one created.
const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) {
    const id = createdIds.pop()!
    await getDb().delete(appointments).where(eq(appointments.id, id))
  }
})

describe('GET /api/appointments', () => {
  it('requires from and to query parameters', async () => {
    const req = new Request('http://localhost/api/appointments')
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })

  it('returns appointments within the given range', async () => {
    const req = new Request('http://localhost/api/appointments?from=2026-09-01&to=2026-09-30')
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBeGreaterThan(0)
  })
})

describe('POST /api/appointments', () => {
  it('rejects a payload missing required fields', async () => {
    const req = new Request('http://localhost/api/appointments', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects an end time that is not after the start time', async () => {
    const providers = await listActiveProviders()
    const req = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', providerId: providers[0].id, startsAt: '2026-10-01T10:00:00', endsAt: '2026-10-01T09:00:00', visitReason: 'Test visit' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a new scheduled appointment', async () => {
    const providers = await listActiveProviders()
    const req = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', providerId: providers[0].id, startsAt: '2026-10-01T09:00:00', endsAt: '2026-10-01T09:30:00', visitReason: 'Test visit' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdIds.push(body.id)
    expect(body.status).toBe('scheduled')
  })
})

describe('PUT /api/appointments/[id]', () => {
  it('rejects a payload with a field outside the allowlist (mass-assignment guard)', async () => {
    const providers = await listActiveProviders()
    const createReq = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0002', providerId: providers[0].id, startsAt: '2026-10-02T09:00:00', endsAt: '2026-10-02T09:30:00', visitReason: 'Test visit' }),
    })
    const created = await (await POST(createReq as never)).json()
    createdIds.push(created.id)

    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ patientId: 'RD-9999' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(400)
  })

  it('updates an appointment status to no_show', async () => {
    const providers = await listActiveProviders()
    const createReq = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0003', providerId: providers[0].id, startsAt: '2026-10-03T09:00:00', endsAt: '2026-10-03T09:30:00', visitReason: 'Test visit' }),
    })
    const created = await (await POST(createReq as never)).json()
    createdIds.push(created.id)

    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ status: 'no_show' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(200)
  })

  it('returns 404 for a nonexistent appointment', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ status: 'completed' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })

  it('rejects a startsAt update that would put it after the existing endsAt', async () => {
    const providers = await listActiveProviders()
    const createReq = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0004', providerId: providers[0].id, startsAt: '2026-10-04T09:00:00', endsAt: '2026-10-04T09:30:00', visitReason: 'Test visit' }),
    })
    const created = await (await POST(createReq as never)).json()
    createdIds.push(created.id)

    // Only startsAt is sent -- the existing endsAt (09:30) is now before it.
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ startsAt: '2026-10-04T10:00:00' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(400)
  })
})

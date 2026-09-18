import { describe, it, expect, vi, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/charges/route'
import { GET as getOne, PATCH } from '@/app/api/charges/[id]/route'
import { getDb } from '@/db/client'
import { charges } from '@/db/schema'
import { inArray } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// This suite exercises the real create/PATCH DB path against the shared dev
// database (not mocked), so every charge it creates is tracked here and
// deleted afterward -- otherwise these rows accumulate permanently, since
// seed()'s guard against destructive reseeds means a non-empty `charges`
// table is never cleared between runs.
const createdChargeIds: number[] = []
afterAll(async () => {
  if (createdChargeIds.length > 0) await getDb().delete(charges).where(inArray(charges.id, createdChargeIds))
})

describe('GET /api/charges', () => {
  it('returns the seeded charges', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(11)
  })
})

describe('POST /api/charges', () => {
  it('rejects a payload missing procedure codes', async () => {
    const req = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17', diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }], procedureCodes: [] }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects a payload with an unexpected extra field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
        status: 'submitted',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a new charge in draft status with amountCents derived from procedureCodes, never trusted from the client', async () => {
    const req = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [
          { code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 },
          { code: '99213', description: 'Office visit', units: 2, chargeCents: 5000 },
        ],
      }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    createdChargeIds.push(body.id)
    expect(res.status).toBe(201)
    expect(body.status).toBe('draft')
    expect(body.amountCents).toBe(25000) // 15000 + 2*5000, computed server-side
  })
})

describe('GET /api/charges/[id]', () => {
  it('returns a single charge', async () => {
    const createReq = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0002', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
      }),
    })
    const created = await (await POST(createReq as never)).json()
    createdChargeIds.push(created.id)

    const res = await getOne(new Request('http://localhost') as never, { params: Promise.resolve({ id: String(created.id) }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe(created.id)
  })

  it('returns 404 for a nonexistent charge', async () => {
    const res = await getOne(new Request('http://localhost') as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/charges/[id]', () => {
  async function createDraft(patientId: string) {
    const createReq = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId, providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
      }),
    })
    const created = await (await POST(createReq as never)).json()
    createdChargeIds.push(created.id)
    return created
  }

  it('rejects an illegal status transition (draft straight to submitted)', async () => {
    const created = await createDraft('RD-0001')
    const req = new Request(`http://localhost/api/charges/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'submitted' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(400)
  })

  it('allows a legal status transition (draft to pending_approval)', async () => {
    const created = await createDraft('RD-0003')
    const req = new Request(`http://localhost/api/charges/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending_approval' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(200)

    const check = await getOne(new Request('http://localhost') as never, { params: Promise.resolve({ id: String(created.id) }) })
    const body = await check.json()
    expect(body.status).toBe('pending_approval')
  })

  it('returns 404 for a nonexistent charge', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'pending_approval' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })
})

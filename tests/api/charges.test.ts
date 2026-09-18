import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/app/api/charges/route'
import { PATCH } from '@/app/api/charges/[id]/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

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
      body: JSON.stringify({ patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17', diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }], procedureCodes: [], amountCents: 100 }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a new charge in draft status', async () => {
    const req = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
        amountCents: 15000,
      }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.status).toBe('draft')
  })
})

describe('PATCH /api/charges/[id]', () => {
  it('rejects an illegal status transition (draft straight to submitted)', async () => {
    const createReq = new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
        amountCents: 15000,
      }),
    })
    const created = await (await POST(createReq as never)).json()

    const req = new Request(`http://localhost/api/charges/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'submitted' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(400)
  })
})

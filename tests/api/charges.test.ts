import { describe, it, expect, vi, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/charges/route'
import { GET as getOne, PATCH } from '@/app/api/charges/[id]/route'
import { getDb } from '@/db/client'
import { charges, auditLog } from '@/db/schema'
import { inArray, desc, eq, or, like } from 'drizzle-orm'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' | 'pharmacy' = 'crc'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: 'Jamie Ruiz' })) }))

afterEach(() => { sessionRole = 'crc' })

// This suite exercises the real create/PATCH DB path against the shared dev
// database (not mocked), so every charge it creates is tracked here and
// deleted afterward -- otherwise these rows accumulate permanently, since
// seed()'s guard against destructive reseeds means a non-empty `charges`
// table is never cleared between runs.
const createdChargeIds: number[] = []
afterAll(async () => {
  if (createdChargeIds.length > 0) await getDb().delete(charges).where(inArray(charges.id, createdChargeIds))
})

// Same reasoning as createdChargeIds above, for the "audit logging" tests'
// real auditLog inserts.
afterAll(async () => {
  await getDb().delete(auditLog).where(or(eq(auditLog.action, 'viewed charges list'), like(auditLog.action, 'viewed charge %')))
})

describe('GET /api/charges', () => {
  it('returns the seeded charges', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(11)
  })
})

describe('GET /api/charges audit logging', () => {
  it('logs an audit entry when the charges list is viewed', async () => {
    await GET()
    // Scoped to this test's own action string, not "the globally latest row"
    // -- the shared dev DB has concurrent writers (other branches/worktrees),
    // so an unscoped "latest row" read is racy.
    const [latest] = await getDb().select().from(auditLog).where(eq(auditLog.action, 'viewed charges list')).orderBy(desc(auditLog.id)).limit(1)
    expect(latest?.action).toBe('viewed charges list')
  })

  it('logs an audit entry when a single charge is viewed', async () => {
    const [existing] = await getDb().select().from(charges).limit(1)
    const req = new Request(`http://localhost/api/charges/${existing.id}`)
    await getOne(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    const action = `viewed charge ${existing.id}`
    const [latest] = await getDb().select().from(auditLog).where(eq(auditLog.action, action)).orderBy(desc(auditLog.id)).limit(1)
    expect(latest?.action).toBe(action)
    expect(latest?.patientId).toBe(existing.patientId)
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
    if (body.id) createdChargeIds.push(body.id)
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
    if (created.id) createdChargeIds.push(created.id)

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
    if (created.id) createdChargeIds.push(created.id)
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

describe('charges route role gating', () => {
  function validChargeBody(patientId: string) {
    return new Request('http://localhost/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        patientId, providerName: 'Dr. R. Kunam', dateOfService: '2026-09-17',
        diagnosisCodes: [{ code: 'F33.1', description: 'MDD' }],
        procedureCodes: [{ code: '90837', description: 'Psychotherapy', units: 1, chargeCents: 15000 }],
      }),
    })
  }

  it('rejects a pharmacy session on POST /api/charges', async () => {
    sessionRole = 'pharmacy'
    const res = await POST(validChargeBody('RD-0001') as never)
    expect(res.status).toBe(403)
  })

  it('rejects a pi session on POST /api/charges -- incidental access the missing gate allowed', async () => {
    sessionRole = 'pi'
    const res = await POST(validChargeBody('RD-0001') as never)
    expect(res.status).toBe(403)
  })

  it('rejects a pharmacy session on PATCH /api/charges/[id]', async () => {
    sessionRole = 'crc'
    const created = await (await POST(validChargeBody('RD-0001') as never)).json()
    if (created.id) createdChargeIds.push(created.id)

    sessionRole = 'pharmacy'
    const req = new Request(`http://localhost/api/charges/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending_approval' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(403)

    // Narrow select on `charges` alone (no `patients` join) -- getOne()/getCharge()
    // join to `patients` for patientName/patientDob, which in this shared dev DB
    // currently 500s due to unrelated column drift from a concurrent worktree's
    // migration. Asserting directly against `charges` avoids that entirely.
    const [row] = await getDb().select({ status: charges.status }).from(charges).where(eq(charges.id, created.id))
    expect(row?.status).toBe('draft')
  })

  it('rejects a pi session on PATCH /api/charges/[id]', async () => {
    sessionRole = 'crc'
    const created = await (await POST(validChargeBody('RD-0001') as never)).json()
    if (created.id) createdChargeIds.push(created.id)

    sessionRole = 'pi'
    const req = new Request(`http://localhost/api/charges/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending_approval' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: String(created.id) }) })
    expect(res.status).toBe(403)
  })

  it('still allows admin and frontdesk on POST /api/charges', async () => {
    sessionRole = 'admin'
    const adminRes = await POST(validChargeBody('RD-0001') as never)
    expect(adminRes.status).toBe(201)
    const adminBody = await adminRes.json()
    if (adminBody.id) createdChargeIds.push(adminBody.id)

    sessionRole = 'frontdesk'
    const frontdeskRes = await POST(validChargeBody('RD-0001') as never)
    expect(frontdeskRes.status).toBe(201)
    const frontdeskBody = await frontdeskRes.json()
    if (frontdeskBody.id) createdChargeIds.push(frontdeskBody.id)
  })
})

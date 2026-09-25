import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/app/api/front-desk/eligibility-check/route'
import { getDb } from '@/db/client'
import { insuranceEligibilityChecks } from '@/db/schema'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'frontdesk', name: 'Taylor Nguyen' })) }))

const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) await getDb().delete(insuranceEligibilityChecks).where(eq(insuranceEligibilityChecks.id, createdIds.pop()!))
})

describe('POST /api/front-desk/eligibility-check', () => {
  it('records and returns a simulated eligibility result', async () => {
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', payerName: 'Aetna' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdIds.push(body.id)
    expect(['verified', 'inactive', 'needs_follow_up']).toContain(body.status)
  })

  it('returns 403 for a pi session', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'pi', name: 'Dr. Kunam' })
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', payerName: 'Aetna' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })

  it('rejects a payload with an unknown field', async () => {
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', payerName: 'Aetna', extra: true }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})

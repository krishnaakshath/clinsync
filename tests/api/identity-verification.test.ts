import { describe, it, expect, vi } from 'vitest'
import { PUT } from '@/app/api/patients/[anonId]/identity/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('PUT /api/patients/[anonId]/identity', () => {
  it('rejects an invalid idType', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ idType: 'ssn_card', idNumber: '123' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(res.status).toBe(400)
  })

  it('marks identity verified for a valid payload', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ idType: 'passport', idNumber: 'P0000001' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ anonId: 'RD-0004' }) })
    expect(res.status).toBe(200)
  })
})

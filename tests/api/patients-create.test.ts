import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/patients/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('POST /api/patients', () => {
  it('rejects a payload missing a name', async () => {
    const req = new Request('http://localhost/api/patients', { method: 'POST', body: JSON.stringify({ dobIntakeq: '1990-01-01' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a client and assigns the next sequential anon ID', async () => {
    const req = new Request('http://localhost/api/patients', { method: 'POST', body: JSON.stringify({ nameIntakeq: 'Test Client', dobIntakeq: '1995-05-05' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^RD-\d{4}$/)
  })
})

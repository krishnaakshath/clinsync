import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/app/api/form-templates/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('GET /api/form-templates', () => {
  it('returns the seeded templates', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(2)
  })
})

describe('POST /api/form-templates', () => {
  it('rejects a payload missing required fields', async () => {
    const req = new Request('http://localhost/api/form-templates', { method: 'POST', body: JSON.stringify({ name: 'x' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a blank template for the Create New Form flow', async () => {
    const req = new Request('http://localhost/api/form-templates', { method: 'POST', body: JSON.stringify({ name: 'Untitled Form', category: 'Consent Forms', diagnosisTag: 'General', questions: [] }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
  })
})

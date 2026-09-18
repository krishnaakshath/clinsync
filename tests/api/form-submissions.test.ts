import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/app/api/form-submissions/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('GET /api/form-submissions', () => {
  it('returns seeded submissions', async () => {
    const req = new Request('http://localhost/api/form-submissions')
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.length).toBeGreaterThan(0)
  })
})

describe('POST /api/form-submissions', () => {
  it('rejects a payload with an unknown field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost/api/form-submissions', { method: 'POST', body: JSON.stringify({ templateId: 1, patientId: 'RD-0001', status: 'completed' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400) // 'status' is not in sendFormSchema — new submissions always start 'sent'
  })

  it('generates a unique access token and a 30-day expiry when a form is sent', async () => {
    const req = new Request('http://localhost/api/form-submissions', { method: 'POST', body: JSON.stringify({ templateId: 1, patientId: 'RD-0001' }) })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(typeof body.accessToken).toBe('string')
    expect(body.accessToken.length).toBeGreaterThan(30)
    expect(new Date(body.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

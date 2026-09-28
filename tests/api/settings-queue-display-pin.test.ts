import { describe, it, expect, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { PUT } from '@/app/api/settings/queue-display-pin/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'admin' as const, name: 'Test Admin' })) }))

describe('PUT /api/settings/queue-display-pin', () => {
  it('returns 401 when there is no authenticated session', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSession).mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ pin: '1234' }) })
    const res = await PUT(req as never)
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'frontdesk', name: 'Test Frontdesk' })
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ pin: '1234' }) })
    const res = await PUT(req as never)
    expect(res.status).toBe(403)
  })

  it('rejects an unknown field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ pin: '1234', notAField: true }) })
    const res = await PUT(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects a PIN shorter than 4 characters', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ pin: '12' }) })
    const res = await PUT(req as never)
    expect(res.status).toBe(400)
  })

  it('accepts a valid PIN from an admin session', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ pin: '4821' }) })
    const res = await PUT(req as never)
    expect(res.status).toBe(200)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'
import { POST } from '@/app/api/patients/route'

// Owner decision: Add New Patient creates a real chart in the connected
// Tebra practice -- admin/crc only. The role gate runs before body parsing
// and before any EHR/DB work, so an empty body must still be a 403 for a PI
// (and a plain 400 validation error, never a 403, for admin/crc).
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'pi' as const, name: 'Dr. Test' })) }
})

const post = () => new NextRequest('http://localhost/api/patients', { method: 'POST', body: '{}', headers: { origin: 'http://localhost', 'content-type': 'application/json' } })

describe('POST /api/patients role gate', () => {
  it('403 Forbidden for pi', async () => {
    const res = await POST(post())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })
  it.each(['admin', 'crc'] as const)('lets %s through to validation (400, nothing created)', async (role) => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role, name: 'Test' })
    expect((await POST(post())).status).toBe(400)
  })
})

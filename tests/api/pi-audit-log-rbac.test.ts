import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'
import { GET } from '@/app/api/audit-log/route'

// The audit log is a practice-wide feed that includes patient IDs: admin and
// crc only. A PI must get 403 and no entries.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'pi' as const, name: 'Dr. Test' })) }
})

const get = () => new NextRequest('http://localhost/api/audit-log?limit=10')

describe('GET /api/audit-log role gate', () => {
  it('403 Forbidden with no entries for pi', async () => {
    const res = await GET(get())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })
  it.each(['admin', 'crc'] as const)('serves entries to %s', async (role) => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role, name: 'Test' })
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(Array.isArray((await res.json()).entries)).toBe(true)
  })
})

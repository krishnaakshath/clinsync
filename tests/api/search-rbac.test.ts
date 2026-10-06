import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as auth from '@/lib/auth'
import { GET } from '@/app/api/search/route'

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn() }
})
vi.mock('@/lib/queries/search', () => ({
  searchAll: vi.fn(async () => ({
    patients: [{ id: 'RD-1', label: 'P', detail: 'RD-1', href: '/patients/RD-1' }],
    trials: [{ id: 't1', label: 'T', detail: 'C', href: '/trials/t1' }],
    formTemplates: [{ id: '7', label: 'F', detail: 'Cat', href: '/forms/7' }],
  })),
}))

const req = () => new NextRequest('http://localhost/api/search?q=x')

describe('GET /api/search form-template results', () => {
  // Form Templates (/forms/*) is an operations-only page; offering a PI a
  // search hit that links there is a dead link (the page redirects them).
  it('omits form templates for a PI', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'pi', name: 'Dr. Test' })
    const body = await (await GET(req())).json()
    expect(body.formTemplates).toEqual([])
    expect(body.patients).toHaveLength(1)
    expect(body.trials).toHaveLength(1)
  })

  it.each(['crc', 'admin'] as const)('keeps form templates for %s', async (role) => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role, name: 'X' })
    const body = await (await GET(req())).json()
    expect(body.formTemplates).toHaveLength(1)
  })
})

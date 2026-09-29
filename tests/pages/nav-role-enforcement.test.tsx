import { describe, it, expect, vi } from 'vitest'
import type { Role } from '@/lib/auth'

// This harness follows tests/pages/audit-log.test.tsx's vi.hoisted +
// vi.resetModules() + per-case vi.doMock shape, with two deliberate changes:
//
// 1. mockRedirect THROWS (like the real next/navigation redirect()) instead
//    of just recording a call. That is what stops a denied role's page body
//    from running on into the data fetch after the gate -- without the
//    throw, a page that calls redirect() but doesn't return/throw afterward
//    would still execute its DB queries, and Review Focus #1 below wouldn't
//    be able to tell the difference.
// 2. @/db/client's getDb is mocked to throw DB_BLOCKED, so no page in the
//    table needs its own query modules mocked. An allowed role gets past the
//    gate and dies at the DB sentinel; the assertion is about mockRedirect,
//    not about rendering.
const { mockRedirect, mockGetDb } = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
  mockGetDb: vi.fn(() => { throw new Error('DB_BLOCKED') }),
}))

export type PageGateCase = {
  route: string // the URL path, e.g. '/forms/[templateId]'
  load: () => Promise<{ default: (props?: never) => Promise<unknown> }>
  props?: unknown // { params: Promise<...>, searchParams: Promise<...> }
  allowed: Role[] // copied from LeftNav.tsx, cited in a comment
}

const ALL_ROLES: Role[] = ['admin', 'crc', 'pi', 'frontdesk']

export async function runPage(c: PageGateCase, role: Role) {
  vi.resetModules()
  mockRedirect.mockClear()
  mockGetDb.mockClear()
  vi.doMock('next/navigation', () => ({
    redirect: mockRedirect,
    notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  }))
  vi.doMock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
  vi.doMock('@/db/client', () => ({ getDb: mockGetDb }))
  vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role, name: `Test ${role}` })) }))
  const mod = await c.load()
  try { await mod.default(c.props as never) } catch { /* DB_BLOCKED, NEXT_REDIRECT and render errors after the gate are all fine */ }
}

export const PAGE_GATES: PageGateCase[] = [
  // LeftNav.tsx:33 — { href: '/workbook', roles: ['admin', 'crc'] }
  { route: '/workbook', load: () => import('@/app/(dashboard)/workbook/page'), allowed: ['admin', 'crc'] },
  // LeftNav.tsx:34 — { href: '/identity-matching', roles: ['admin', 'crc'] }
  { route: '/identity-matching', load: () => import('@/app/(dashboard)/identity-matching/page'), allowed: ['admin', 'crc'] },
]

describe.each(PAGE_GATES)('$route', (c) => {
  it('redirects every role the nav hides, and no role the nav shows', async () => {
    for (const role of ALL_ROLES) {
      await runPage(c, role)
      if (c.allowed.includes(role)) {
        expect(mockRedirect, `${c.route} must not redirect ${role}`).not.toHaveBeenCalled()
      } else {
        expect(mockRedirect, `${c.route} must redirect ${role}`).toHaveBeenCalledWith('/')
      }
    }
  })

  // Review Focus #1
  it('never touches the database for a role it denies', async () => {
    for (const role of ALL_ROLES.filter((r) => !c.allowed.includes(r))) {
      await runPage(c, role)
      expect(mockGetDb, `${c.route} loaded data before denying ${role}`).not.toHaveBeenCalled()
    }
  })
})

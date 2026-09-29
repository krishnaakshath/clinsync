import { vi } from 'vitest'
import type { Role } from '@/lib/auth'

// Plain (non-`.test.`) helper module so Tasks 2-5 can import `PageGateCase`,
// `runPage`, `PAGE_GATES`, and `ALL_ROLES` without re-triggering
// `nav-role-enforcement.test.tsx`'s own `describe`/`it` registration --
// importing a `.test.tsx` file from another test file makes vitest load and
// re-run every test in it a second time.
//
// This harness follows tests/pages/audit-log.test.tsx's vi.hoisted +
// vi.resetModules() + per-case vi.doMock shape, with three deliberate
// changes, each documented at its mock below:
//
// 1. mockRedirect THROWS (like the real next/navigation redirect()) instead
//    of just recording a call. That is what stops a denied role's page body
//    from running on into the data fetch after the gate -- without the
//    throw, a page that calls redirect() but doesn't return/throw afterward
//    would still execute its DB queries, and Review Focus #1 wouldn't be
//    able to tell the difference.
// 2. @/db/client's getDb is mocked to throw DB_BLOCKED, so no page in the
//    table needs its own query modules mocked. An allowed role gets past the
//    gate and dies at the DB sentinel; the assertion is about mockRedirect,
//    not about rendering.
// 3. @/lib/cache's getOrSetCache is forced to always call its loader (never
//    short-circuit to a cached value), and getRedis is blocked outright.
//    getOrSetCache reads from live shared Upstash Redis before ever calling
//    its loader -- and therefore before ever calling getDb. Task 1's two
//    page loaders (workbook, identity-matching) throw before anything gets
//    cached, so this was safe by accident; Tasks 2-5 add pages whose loaders
//    succeed (patients, trials, charges, forms lists) and populate Redis,
//    after which a page with a MISSING gate could still pass "never touches
//    the database for a denied role" as a false negative by serving a
//    previously-cached value instead of calling getDb. Forcing every call
//    through the loader (and blocking the real client) closes that gap.
// vi.hoisted can't itself be the target of a destructuring `export const`
// (its hoisting transform requires the declaration to be a plain identifier
// or destructure with no `export` keyword directly on it) -- so hoist into
// a private binding and re-export the two fields separately.
const hoistedMocks = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
  mockGetDb: vi.fn(() => { throw new Error('DB_BLOCKED') }),
}))
export const mockRedirect = hoistedMocks.mockRedirect
export const mockGetDb = hoistedMocks.mockGetDb

export type PageGateCase = {
  route: string // the URL path, e.g. '/forms/[templateId]'
  load: () => Promise<{ default: (props: never) => Promise<unknown> }>
  props?: unknown // { params: Promise<...>, searchParams: Promise<...> }
  allowed: Role[] // copied from LeftNav.tsx, cited in a comment
}

export const ALL_ROLES: Role[] = ['admin', 'crc', 'pi', 'frontdesk']

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
  vi.doMock('@/lib/cache', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/cache')>()),
    getOrSetCache: (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    getRedis: () => { throw new Error('REDIS_BLOCKED') },
  }))
  vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role, name: `Test ${role}` })) }))
  const mod = await c.load()
  try { await mod.default(c.props as never) } catch { /* DB_BLOCKED, REDIS_BLOCKED, NEXT_REDIRECT and render errors after the gate are all fine */ }
}

export const PAGE_GATES: PageGateCase[] = [
  // LeftNav.tsx:33 — { href: '/workbook', roles: ['admin', 'crc'] }
  { route: '/workbook', load: () => import('@/app/(dashboard)/workbook/page'), allowed: ['admin', 'crc'] },
  // LeftNav.tsx:34 — { href: '/identity-matching', roles: ['admin', 'crc'] }
  { route: '/identity-matching', load: () => import('@/app/(dashboard)/identity-matching/page'), allowed: ['admin', 'crc'] },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/charges', load: () => import('@/app/(dashboard)/billing/charges/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  {
    route: '/billing/charges/[chargeId]',
    load: () => import('@/app/(dashboard)/billing/charges/[chargeId]/page'),
    props: { params: Promise.resolve({ chargeId: '1' }) },
    allowed: ['admin', 'crc', 'frontdesk'],
  },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/insurance-collections', load: () => import('@/app/(dashboard)/billing/insurance-collections/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/patient-collections', load: () => import('@/app/(dashboard)/billing/patient-collections/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/statements', load: () => import('@/app/(dashboard)/billing/statements/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/ar-dashboard', load: () => import('@/app/(dashboard)/billing/ar-dashboard/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  { route: '/billing/analytics', load: () => import('@/app/(dashboard)/billing/analytics/page'), allowed: ['admin', 'crc', 'frontdesk'] },
  // LeftNav.tsx:98 — showBilling
  {
    route: '/billing/pay',
    load: () => import('@/app/(dashboard)/billing/pay/page'),
    props: { searchParams: Promise.resolve({}) },
    allowed: ['admin', 'crc', 'frontdesk'],
  },
]

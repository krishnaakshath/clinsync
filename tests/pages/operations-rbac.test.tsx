import { describe, it, expect, vi } from 'vitest'
import * as auth from '@/lib/auth'

// Every page below sits behind a LeftNav entry restricted to the operations
// roles (admin + crc). Hiding the nav link is not access control: a live
// probe against a production build showed a PI session getting a full 200
// render of every one of these pages by typing the URL. Each page must
// redirect a non-operations role before it loads any data.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
// A page that (wrongly) renders for pi would write a "viewed ..." row into
// the shared audit_log -- stub it so this test never writes.
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSessionOrRedirect: vi.fn() }
})

const PAGES: [string, () => Promise<{ default: (props: never) => unknown }>][] = [
  ['/workbook', () => import('@/app/(dashboard)/workbook/page')],
  ['/identity-matching', () => import('@/app/(dashboard)/identity-matching/page')],
  ['/forms', () => import('@/app/(dashboard)/forms/page')],
  ['/forms/[templateId]', () => import('@/app/(dashboard)/forms/[templateId]/page')],
  ['/billing/analytics', () => import('@/app/(dashboard)/billing/analytics/page')],
  ['/billing/ar-dashboard', () => import('@/app/(dashboard)/billing/ar-dashboard/page')],
  ['/billing/charges', () => import('@/app/(dashboard)/billing/charges/page')],
  ['/billing/charges/[chargeId]', () => import('@/app/(dashboard)/billing/charges/[chargeId]/page')],
  ['/billing/insurance-collections', () => import('@/app/(dashboard)/billing/insurance-collections/page')],
  ['/billing/patient-collections', () => import('@/app/(dashboard)/billing/patient-collections/page')],
  ['/billing/pay', () => import('@/app/(dashboard)/billing/pay/page')],
  ['/billing/statements', () => import('@/app/(dashboard)/billing/statements/page')],
  ['/broadcasts', () => import('@/app/(dashboard)/broadcasts/page')],
  ['/broadcasts/[id]', () => import('@/app/(dashboard)/broadcasts/[id]/page')],
  ['/documents', () => import('@/app/(dashboard)/documents/page')],
  ['/documents/fax-history', () => import('@/app/(dashboard)/documents/fax-history/page')],
  ['/experience-surveys', () => import('@/app/(dashboard)/experience-surveys/page')],
  ['/experience-surveys/[id]', () => import('@/app/(dashboard)/experience-surveys/[id]/page')],
  ['/pipeline-dashboard', () => import('@/app/(dashboard)/pipeline-dashboard/page')],
  ['/reports/patients', () => import('@/app/(dashboard)/reports/patients/page')],
  ['/reports/appointments/all', () => import('@/app/(dashboard)/reports/appointments/all/page')],
  ['/reports/claims/insurance-collections', () => import('@/app/(dashboard)/reports/claims/insurance-collections/page')],
  ['/reports/encounters/all', () => import('@/app/(dashboard)/reports/encounters/all/page')],
  ['/reports/notes/unsigned', () => import('@/app/(dashboard)/reports/notes/unsigned/page')],
]

// Bogus ids/params: the gate must fire before any of these are used.
const PROPS = {
  params: Promise.resolve({ templateId: '0', chargeId: '0', id: '0' }),
  searchParams: Promise.resolve({}),
} as never

describe('operations-only pages redirect a PI session', () => {
  it.each(PAGES)('%s redirects pi to /', async (_path, load) => {
    vi.mocked(auth.requireSessionOrRedirect).mockResolvedValue({ role: 'pi', name: 'Dr. Test' })
    const { default: Page } = await load()
    await expect(Promise.resolve().then(() => Page(PROPS))).rejects.toThrow('NEXT_REDIRECT:/')
  })
})

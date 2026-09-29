import { describe, it, expect } from 'vitest'
import { ALL_ROLES, PAGE_GATES, mockGetDb, mockRedirect, runPage } from './page-gates-harness'
import { NAV_ITEMS, NAV_TRAILING_ITEMS, NAV_BILLING_ITEMS, BILLING_ROLES } from '@/components/LeftNav'

// The harness itself (PageGateCase, runPage, PAGE_GATES, ALL_ROLES, and the
// mockRedirect/mockGetDb spies) lives in ./page-gates-harness.ts, a plain
// (non-`.test.`) module, so later tasks can import and extend PAGE_GATES
// without vitest re-registering the describe/it blocks below a second time.

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

function coveringRows(href: string) {
  return PAGE_GATES.filter((r) => r.route === href || r.route.startsWith(`${href}/`))
}

describe('every role-restricted nav entry has a matching server-side gate', () => {
  const restricted = [...NAV_ITEMS, ...NAV_TRAILING_ITEMS].filter((i) => i.roles)

  // Review Focus #5 — a prefix rule that matches nothing is how this
  // whole class of bug gets reintroduced, so assert the count first.
  it.each(restricted)('$href has at least one gated page', (entry) => {
    expect(coveringRows(entry.href).length, `${entry.href} is hidden from some roles in the nav but no page under it is gated`).toBeGreaterThan(0)
  })

  it.each(restricted)('$href is gated to exactly the roles the nav shows it to', (entry) => {
    for (const row of coveringRows(entry.href)) {
      expect(new Set(row.allowed), `${row.route} disagrees with LeftNav's roles for ${entry.href}`).toEqual(new Set(entry.roles))
    }
  })

  it.each(NAV_BILLING_ITEMS)('$href is gated to exactly BILLING_ROLES', (entry) => {
    const rows = coveringRows(entry.href)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(new Set(row.allowed)).toEqual(new Set(BILLING_ROLES))
  })

  it('does not gate a nav entry the nav shows to everyone', () => {
    for (const entry of [...NAV_ITEMS, ...NAV_TRAILING_ITEMS].filter((i) => !i.roles)) {
      expect(coveringRows(entry.href), `${entry.href} is visible to every role in the nav but a gate was added for it`).toEqual([])
    }
  })
})

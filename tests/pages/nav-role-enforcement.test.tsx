import { describe, it, expect } from 'vitest'
import { ALL_ROLES, PAGE_GATES, mockGetDb, mockRedirect, runPage } from './page-gates-harness'

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

import { describe, it, expect } from 'vitest'
import { ROLE_CAPABILITIES } from '@/lib/role-capabilities'
import type { Role } from '@/lib/auth'

describe('ROLE_CAPABILITIES', () => {
  it('has an entry for exactly the four real roles, no more, no less', () => {
    const expectedRoles: Role[] = ['crc', 'pi', 'admin', 'frontdesk']
    expect(new Set(Object.keys(ROLE_CAPABILITIES))).toEqual(new Set(expectedRoles))
  })

  it('gives every role a non-empty label, summary, and at least one bullet', () => {
    for (const role of Object.keys(ROLE_CAPABILITIES) as Role[]) {
      const entry = ROLE_CAPABILITIES[role]
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.summary.length).toBeGreaterThan(0)
      expect(entry.bullets.length).toBeGreaterThan(0)
    }
  })

  it('names imaging attachment on the admin and pi capability bullets', () => {
    for (const role of ['admin', 'pi'] as const) {
      expect(ROLE_CAPABILITIES[role].bullets.join(' ')).toContain('attach imaging results')
    }
    expect(ROLE_CAPABILITIES.frontdesk.bullets.join(' ')).not.toContain('attach imaging')
    expect(ROLE_CAPABILITIES.crc.bullets.join(' ')).not.toContain('attach imaging')
  })
})

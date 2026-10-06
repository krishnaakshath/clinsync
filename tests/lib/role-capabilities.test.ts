import { describe, it, expect } from 'vitest'
import { ROLE_CAPABILITIES } from '@/lib/role-capabilities'
import type { Role } from '@/lib/auth'

describe('ROLE_CAPABILITIES', () => {
  it('has an entry for exactly the three real roles, no more, no less', () => {
    const expectedRoles: Role[] = ['crc', 'pi', 'admin']
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
})

describe('canAccessOperations', () => {
  it('is true for exactly the roles LeftNav shows the operations surface to (admin, crc)', async () => {
    const { canAccessOperations, OPERATIONS_ROLES } = await import('@/lib/role-capabilities')
    expect([...OPERATIONS_ROLES].sort()).toEqual(['admin', 'crc'])
    expect(canAccessOperations('admin')).toBe(true)
    expect(canAccessOperations('crc')).toBe(true)
    expect(canAccessOperations('pi')).toBe(false)
  })
})

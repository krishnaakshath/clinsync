import { describe, it, expect } from 'vitest'
import { canSendForms, canAddPatients, canViewActivityFeed, ROLE_CAPABILITIES } from '@/lib/role-capabilities'

describe('role action capabilities', () => {
  it.each([canSendForms, canAddPatients, canViewActivityFeed])('%o is admin + crc only', (fn) => {
    expect(fn('admin')).toBe(true)
    expect(fn('crc')).toBe(true)
    expect(fn('pi')).toBe(false)
  })

  it('PI capability text no longer implies these actions and says they are not theirs', () => {
    const text = ROLE_CAPABILITIES.pi.summary + ROLE_CAPABILITIES.pi.bullets.join(' ')
    expect(text).toMatch(/sending forms|send/i)
    expect(ROLE_CAPABILITIES.crc.bullets.join(' ')).toMatch(/Add New Patient/)
    expect(ROLE_CAPABILITIES.crc.bullets.join(' ')).toMatch(/activity feed/i)
  })
})

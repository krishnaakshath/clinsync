import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/doctor-queue-provider', () => ({ resolveDoctorQueueProvider: vi.fn() }))
vi.mock('@/lib/queries/doctor-assignments', () => ({
  countPendingAssignmentsForProvider: vi.fn(),
  countUnacknowledgedDeclines: vi.fn(),
}))

import { getNavBadges } from '@/lib/nav-badges'
import { resolveDoctorQueueProvider } from '@/lib/doctor-queue-provider'
import { countPendingAssignmentsForProvider, countUnacknowledgedDeclines } from '@/lib/queries/doctor-assignments'

const resolveMock = vi.mocked(resolveDoctorQueueProvider)
const pendingMock = vi.mocked(countPendingAssignmentsForProvider)
const declinesMock = vi.mocked(countUnacknowledgedDeclines)

describe('getNavBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pi with a matched provider gets the pending count on /doctor', async () => {
    resolveMock.mockResolvedValue({ id: 7, name: 'Dr. R. Kunam' })
    pendingMock.mockResolvedValue(2)
    expect(await getNavBadges({ role: 'pi', name: 'Dr. R. Kunam', userId: null })).toEqual({ '/doctor': 2 })
    expect(pendingMock).toHaveBeenCalledWith(7)
  })

  it('pi unmatched gets no /doctor key and runs no count', async () => {
    resolveMock.mockResolvedValue(null)
    const badges = await getNavBadges({ role: 'pi', name: 'Dr. Nobody Matchington', userId: null })
    expect(badges).toEqual({})
    expect('/doctor' in badges).toBe(false)
    expect(pendingMock).not.toHaveBeenCalled()
  })

  it('frontdesk gets the unacknowledged-decline count on /front-desk/assignments', async () => {
    declinesMock.mockResolvedValue(3)
    expect(await getNavBadges({ role: 'frontdesk', name: 'Taylor Nguyen', userId: null })).toEqual({ '/front-desk/assignments': 3 })
  })

  it('billing gets nothing and runs no query', async () => {
    expect(await getNavBadges({ role: 'billing', name: 'Bill Ing', userId: null })).toEqual({})
    expect(pendingMock).not.toHaveBeenCalled()
    expect(declinesMock).not.toHaveBeenCalled()
    expect(resolveMock).not.toHaveBeenCalled()
  })
})

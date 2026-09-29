import { describe, it, expect, vi } from 'vitest'

// Unlike some of this codebase's other page-gate tests (e.g.
// tests/pages/audit-log.test.tsx), redirect() here throws, matching real
// Next.js redirect() semantics (it always interrupts rendering via a thrown
// NEXT_REDIRECT signal). This matters for this file specifically because it
// asserts a *negative* -- that logAudit is never called for a rejected
// session -- which is only a meaningful assertion if the page component
// actually stops executing at the redirect call, the same way it does in
// production and in the real-dev-server verification for this fix.
const { mockRedirect, mockNotFound } = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
vi.mock('@/components/TelemedicineCallScreen', () => ({
  TelemedicineCallScreen: () => 'call-screen-stub',
}))

const SESSION_ROW = {
  id: 42,
  appointmentId: 900,
  appointmentProviderId: 7, // matches "Dr. R. Kunam" below
  appointmentPatientId: 'RD-0001',
  patientJoinToken: 'token-xyz',
  status: 'waiting' as const,
  providerJoinedAt: null,
  patientJoinedAt: null,
  endedAt: null,
  createdAt: new Date(),
}

describe('Provider call screen page (/telemedicine/[sessionId]) — role/ownership gate (Important #3)', () => {
  it('redirects a crc session instead of rendering or writing the "joined" audit entry', async () => {
    const logAudit = vi.fn(async () => undefined)
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'crc', name: 'Test CRC' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit }))
    vi.doMock('@/lib/queries/telemedicine-sessions', () => ({ getSessionById: vi.fn(async () => SESSION_ROW) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => []) }))
    const { default: TelemedicineCallPage } = await import('@/app/(dashboard)/telemedicine/[sessionId]/page')

    await expect(TelemedicineCallPage({ params: Promise.resolve({ sessionId: '42' }) })).rejects.toThrow('NEXT_REDIRECT:/')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('redirects a frontdesk session instead of rendering', async () => {
    vi.resetModules()
    const logAudit = vi.fn(async () => undefined)
    vi.doMock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
    vi.doMock('@/components/TelemedicineCallScreen', () => ({ TelemedicineCallScreen: () => 'call-screen-stub' }))
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'frontdesk', name: 'Test Frontdesk' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit }))
    vi.doMock('@/lib/queries/telemedicine-sessions', () => ({ getSessionById: vi.fn(async () => SESSION_ROW) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => []) }))
    const { default: TelemedicineCallPage } = await import('@/app/(dashboard)/telemedicine/[sessionId]/page')

    mockRedirect.mockClear()
    await expect(TelemedicineCallPage({ params: Promise.resolve({ sessionId: '42' }) })).rejects.toThrow('NEXT_REDIRECT:/')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('redirects a pi session that is NOT the session\'s own provider', async () => {
    vi.resetModules()
    const logAudit = vi.fn(async () => undefined)
    vi.doMock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
    vi.doMock('@/components/TelemedicineCallScreen', () => ({ TelemedicineCallScreen: () => 'call-screen-stub' }))
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. Someone Else' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit }))
    vi.doMock('@/lib/queries/telemedicine-sessions', () => ({ getSessionById: vi.fn(async () => SESSION_ROW) }))
    // Roster resolves this pi's name to provider id 99, not the session's
    // own provider (id 7) -- must be rejected the same as a genuinely
    // unmatched pi.
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 99, name: 'Dr. Someone Else', credentials: null, specialty: 'Psychiatry', colorTag: 'chart-1', isActive: true }]) }))
    const { default: TelemedicineCallPage } = await import('@/app/(dashboard)/telemedicine/[sessionId]/page')

    mockRedirect.mockClear()
    await expect(TelemedicineCallPage({ params: Promise.resolve({ sessionId: '42' }) })).rejects.toThrow('NEXT_REDIRECT:/')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('renders (and audits) for the pi who IS the session\'s own provider', async () => {
    vi.resetModules()
    const logAudit = vi.fn(async () => undefined)
    vi.doMock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
    vi.doMock('@/components/TelemedicineCallScreen', () => ({ TelemedicineCallScreen: () => 'call-screen-stub' }))
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit }))
    vi.doMock('@/lib/queries/telemedicine-sessions', () => ({ getSessionById: vi.fn(async () => SESSION_ROW) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 7, name: 'Dr. R. Kunam', credentials: null, specialty: 'Psychiatry', colorTag: 'chart-1', isActive: true }]) }))
    const { default: TelemedicineCallPage } = await import('@/app/(dashboard)/telemedicine/[sessionId]/page')

    mockRedirect.mockClear()
    const jsx = await TelemedicineCallPage({ params: Promise.resolve({ sessionId: '42' }) })
    const { render, screen } = await import('@testing-library/react')
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ role: 'pi' }), 'joined telemedicine call as provider', 'RD-0001')
    expect(screen.getByText('call-screen-stub')).toBeInTheDocument()
  })

  it('renders (and audits) for an admin session regardless of provider match', async () => {
    vi.resetModules()
    const logAudit = vi.fn(async () => undefined)
    vi.doMock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
    vi.doMock('@/components/TelemedicineCallScreen', () => ({ TelemedicineCallScreen: () => 'call-screen-stub' }))
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'admin', name: 'Someone Else Entirely' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit }))
    vi.doMock('@/lib/queries/telemedicine-sessions', () => ({ getSessionById: vi.fn(async () => SESSION_ROW) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => []) }))
    const { default: TelemedicineCallPage } = await import('@/app/(dashboard)/telemedicine/[sessionId]/page')

    mockRedirect.mockClear()
    const jsx = await TelemedicineCallPage({ params: Promise.resolve({ sessionId: '42' }) })
    const { render, screen } = await import('@testing-library/react')
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalled()
    expect(screen.getByText('call-screen-stub')).toBeInTheDocument()
  })
})

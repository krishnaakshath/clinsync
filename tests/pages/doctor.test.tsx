import { describe, it, expect, vi } from 'vitest'
import DoctorPortalPage from '@/app/(dashboard)/doctor/page'

vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/queries/patients', () => ({
  listPatientsWithStatus: vi.fn(async () => [
    { id: 'RD-0001', overallStatus: 'green', name: 'Jane Doe', dob: '1990-01-01', currentProvider: 'Dr. R. Kunam', referralType: null, lastCommunication: null, criteriaSummary: null },
  ]),
}))
// The page also resolves the PI's own provider row and pending assignment
// queue (Task 4). Default these to empty here so the two pre-existing tests
// above stay fully isolated (no real DB call) -- the new test below swaps in
// richer data via vi.doMock + vi.resetModules for its own scenario.
vi.mock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => []) }))
vi.mock('@/lib/queries/doctor-assignments', () => ({ listPendingAssignmentsForProvider: vi.fn(async () => []) }))
// Fix round (Important #2): /doctor now also fetches this pi's own
// appointments to wire the telemedicine start entry point -- mocked here,
// same as the other queries above, to keep these two pre-existing tests
// isolated from a real DB call.
vi.mock('@/lib/queries/appointments', () => ({ listAppointmentsInRange: vi.fn(async () => []) }))

describe('PI dashboard (/doctor)', () => {
  it('keeps every stat tile from the original page (content parity)', async () => {
    const jsx = await DoctorPortalPage()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)
    expect(screen.getByText(/total assigned/i)).toBeInTheDocument()
    expect(screen.getAllByText(/^meets$/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/needs verification/i)).toBeInTheDocument()
    expect(screen.getByText(/potential exclusion/i)).toBeInTheDocument()
    expect(screen.getByText(/my patients/i)).toBeInTheDocument()
  })

  it('labels the header with an explicit "assigned to you" framing (Heidi-style personalized dashboard)', async () => {
    const jsx = await DoctorPortalPage()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)
    expect(screen.getByText(/assigned to you/i)).toBeInTheDocument()
  })

  it('shows a pending assignment in its own "Assigned to you" queue section', async () => {
    vi.resetModules()
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
    vi.doMock('@/lib/queries/patients', () => ({
      listPatientsWithStatus: vi.fn(async () => [
        { id: 'RD-0001', overallStatus: 'green', name: 'Jane Doe', dob: '1990-01-01', currentProvider: 'Dr. R. Kunam', referralType: null, lastCommunication: null, criteriaSummary: null },
      ]),
    }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 1, name: 'Dr. R. Kunam' }]) }))
    vi.doMock('@/lib/queries/doctor-assignments', () => ({
      listPendingAssignmentsForProvider: vi.fn(async () => [
        { id: 1, patientId: 'RD-0001', providerId: 1, visitType: 'outpatient', urgency: 'urgent', reason: 'New patient intake', status: 'pending', roomId: null, assignedByName: 'Taylor Nguyen', appointmentId: null, declineReason: null, createdAt: new Date() },
      ]),
    }))
    vi.doMock('@/lib/queries/appointments', () => ({ listAppointmentsInRange: vi.fn(async () => []) }))
    const { default: DoctorPortalPageWithAssignments } = await import('@/app/(dashboard)/doctor/page')
    const jsx = await DoctorPortalPageWithAssignments()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)
    expect(screen.getByRole('heading', { name: /assigned to you/i })).toBeInTheDocument()
    expect(screen.getByText(/new patient intake/i)).toBeInTheDocument()
  })

  it('gives pi a telemedicine start entry point scoped to their own matched provider row (Important #2)', async () => {
    vi.resetModules()
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
    vi.doMock('@/lib/queries/patients', () => ({ listPatientsWithStatus: vi.fn(async () => []) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 7, name: 'Dr. R. Kunam' }]) }))
    vi.doMock('@/lib/queries/doctor-assignments', () => ({ listPendingAssignmentsForProvider: vi.fn(async () => []) }))
    const listAppointmentsInRange = vi.fn(async () => [{
      id: 501, patientId: 'RD-0001', patientName: 'Jane Doe', providerId: 7, providerName: 'Dr. R. Kunam',
      providerColorTag: 'chart-1', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 60000),
      visitReason: 'Follow-up', status: 'scheduled', notes: null,
    }])
    vi.doMock('@/lib/queries/appointments', () => ({ listAppointmentsInRange }))
    const { default: DoctorPortalPageWithAppointments } = await import('@/app/(dashboard)/doctor/page')
    const jsx = await DoctorPortalPageWithAppointments()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)

    expect(screen.getByText(/my appointments/i)).toBeInTheDocument()
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start telemedicine visit/i })).toBeInTheDocument()

    // Ownership scoping happens at the query level, not a per-row client
    // filter -- assert the page actually asked for only this pi's own
    // matched provider id, not every provider's appointments.
    expect(listAppointmentsInRange).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), [7])
  })

  it('scopes to an empty appointment list (not "all providers") when the pi has no matched provider row', async () => {
    vi.resetModules()
    vi.doMock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. Nobody' })) }))
    vi.doMock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
    vi.doMock('@/lib/queries/patients', () => ({ listPatientsWithStatus: vi.fn(async () => []) }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 7, name: 'Dr. R. Kunam' }]) }))
    vi.doMock('@/lib/queries/doctor-assignments', () => ({ listPendingAssignmentsForProvider: vi.fn(async () => []) }))
    const listAppointmentsInRange = vi.fn(async () => [])
    vi.doMock('@/lib/queries/appointments', () => ({ listAppointmentsInRange }))
    const { default: DoctorPortalPageNoMatch } = await import('@/app/(dashboard)/doctor/page')
    const jsx = await DoctorPortalPageNoMatch()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)

    expect(screen.getByText(/my appointments/i)).toBeInTheDocument()
    expect(listAppointmentsInRange).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), [])
  })
})

import { describe, it, expect, vi } from 'vitest'
import DoctorPortalPage from '@/app/(dashboard)/doctor/page'

vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/queries/patients', () => ({
  listPatientsWithStatus: vi.fn(async () => [
    { id: 'RD-0001', overallStatus: 'green', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe', dobTebra: null, dobIntakeq: '1990-01-01', currentProvider: 'Dr. R. Kunam', referralType: null, lastCommunication: null, criteriaSummary: null },
  ]),
}))
// The page also resolves the PI's own provider row and pending assignment
// queue (Task 4). Default these to empty here so the two pre-existing tests
// above stay fully isolated (no real DB call) -- the new test below swaps in
// richer data via vi.doMock + vi.resetModules for its own scenario.
vi.mock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => []) }))
vi.mock('@/lib/queries/doctor-assignments', () => ({ listPendingAssignmentsForProvider: vi.fn(async () => []) }))

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
        { id: 'RD-0001', overallStatus: 'green', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe', dobTebra: null, dobIntakeq: '1990-01-01', currentProvider: 'Dr. R. Kunam', referralType: null, lastCommunication: null, criteriaSummary: null },
      ]),
    }))
    vi.doMock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 1, name: 'Dr. R. Kunam' }]) }))
    vi.doMock('@/lib/queries/doctor-assignments', () => ({
      listPendingAssignmentsForProvider: vi.fn(async () => [
        { id: 1, patientId: 'RD-0001', providerId: 1, visitType: 'outpatient', urgency: 'urgent', reason: 'New patient intake', status: 'pending', roomId: null, assignedByName: 'Taylor Nguyen', appointmentId: null, declineReason: null, createdAt: new Date() },
      ]),
    }))
    const { default: DoctorPortalPageWithAssignments } = await import('@/app/(dashboard)/doctor/page')
    const jsx = await DoctorPortalPageWithAssignments()
    const { render, screen } = await import('@testing-library/react')
    render(jsx)
    expect(screen.getByRole('heading', { name: /assigned to you/i })).toBeInTheDocument()
    expect(screen.getByText(/new patient intake/i)).toBeInTheDocument()
  })
})

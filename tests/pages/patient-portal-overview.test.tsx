import { describe, it, expect, vi } from 'vitest'
import PatientPortalOverviewPage from '@/app/patient-portal/(authenticated)/page'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/patient-session', () => ({ requirePatientSessionOrRedirect: vi.fn(async () => ({ patientId: 'RD-0001' })) }))
vi.mock('@/lib/patient-portal-audit', () => ({ logPatientPortalAction: vi.fn(async () => undefined) }))
vi.mock('@/lib/queries/broadcasts', () => ({ listBroadcastsForPatient: vi.fn(async () => []) }))
vi.mock('@/lib/queries/patient-portal', () => ({
  getPatientPortalData: vi.fn(async () => ({
    currentProvider: 'Dr. R. Kunam',
    activeMedications: [{ name: 'Sertraline' }],
    diagnoses: [{ code: 'F33.1', description: 'Major depressive disorder' }],
    upcomingAppointments: [{ visitReason: 'Follow-up', providerName: 'Dr. R. Kunam', startsAt: new Date().toISOString() }],
    forms: [{ status: 'sent', templateName: 'Intake Form' }],
    unreadMessageCount: 2,
  })),
}))

describe('Patient dashboard (patient-portal overview)', () => {
  it('keeps every summary tile and section from the original page (content parity)', async () => {
    const jsx = await PatientPortalOverviewPage()
    render(jsx)
    expect(screen.getAllByText(/care team/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/current meds/i)).toBeInTheDocument()
    expect(screen.getByText(/forms to complete/i)).toBeInTheDocument()
    expect(screen.getByText(/upcoming visits/i)).toBeInTheDocument()
    expect(screen.getByText(/new messages/i)).toBeInTheDocument()
    expect(screen.getByText(/announcements/i)).toBeInTheDocument()
    expect(screen.getByText(/your care team/i)).toBeInTheDocument()
    expect(screen.getByText(/diagnoses on file/i)).toBeInTheDocument()
  })

  it('puts the action-nudge cards (next visit, needs attention) before the summary tiles in document order (Hims-style Action Items pattern)', async () => {
    const jsx = await PatientPortalOverviewPage()
    const { container } = render(jsx)
    const nudge = container.querySelector('[data-testid="patient-action-items"]')
    const tiles = container.querySelector('[data-testid="patient-summary-tiles"]')
    expect(nudge).not.toBeNull()
    expect(tiles).not.toBeNull()
    expect(nudge!.compareDocumentPosition(tiles!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

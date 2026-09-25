import { describe, it, expect, vi } from 'vitest'
import DoctorPortalPage from '@/app/(dashboard)/doctor/page'

vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/queries/patients', () => ({
  listPatientsWithStatus: vi.fn(async () => [
    { id: 'RD-0001', overallStatus: 'green', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe', dobTebra: null, dobIntakeq: '1990-01-01', currentProvider: 'Dr. R. Kunam', referralType: null, lastCommunication: null, criteriaSummary: null },
  ]),
}))

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
})

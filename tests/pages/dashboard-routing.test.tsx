import { describe, it, expect, vi } from 'vitest'

// Vitest 5 no longer auto-hoists bare `const mock*` declarations referenced
// inside a `vi.mock` factory (the brief's literal snippet throws "Cannot
// access 'mockRedirect' before initialization" under this project's vitest
// version) -- `vi.hoisted` is the supported way to get the same effect, with
// no change to what the test actually verifies.
const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'pi', name: 'Test PI' })) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/queries/dashboard', () => ({ getDashboardData: vi.fn(async () => ({
  latestForms: [], pendingForms: [], pendingFormsTotal: 0, pendingClassification: [], recentEvents: [],
  patientsByMonth: [], screeningBreakdown: { green: 0, yellow: 0, red: 0 }, peakHourRange: null,
  avgExperienceRating: null, completedReviewCount: 0,
})) }))
vi.mock('@/lib/queries/form-templates', () => ({ listFormTemplates: vi.fn(async () => []) }))
vi.mock('@/lib/queries/patients', () => ({ listPatientsWithStatus: vi.fn(async () => []) }))
vi.mock('@/lib/queries/appointments', () => ({ listAppointmentsInRange: vi.fn(async () => []) }))
vi.mock('@/lib/queries/users', () => ({ listAllUsers: vi.fn(async () => []) }))

import DashboardHomePage from '@/app/(dashboard)/page'

describe('dashboard role routing', () => {
  it('redirects a PI session to /doctor instead of rendering a Home dashboard', async () => {
    await DashboardHomePage()
    expect(mockRedirect).toHaveBeenCalledWith('/doctor')
  })

  it('renders the FrontDeskDashboard for a frontdesk session', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSessionOrRedirect).mockResolvedValueOnce({ role: 'frontdesk', name: 'Taylor Nguyen' })
    const { render, screen } = await import('@testing-library/react')
    const jsx = await DashboardHomePage()
    render(jsx)
    expect(screen.getByText(/front desk/i)).toBeInTheDocument()
  })
})

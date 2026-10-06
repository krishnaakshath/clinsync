import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as auth from '@/lib/auth'
import DashboardHomePage from '@/app/(dashboard)/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), redirect: vi.fn(), usePathname: () => '/' }))
vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/queries/dashboard', () => ({
  getDashboardData: async () => ({
    latestForms: [], pendingForms: [], pendingFormsTotal: 0, pendingClassification: [], recentEvents: [],
    patientsByMonth: [], screeningBreakdown: { green: 0, yellow: 0, red: 0 }, peakHourRange: null,
    avgExperienceRating: null, completedReviewCount: 0,
  }),
}))
vi.mock('@/lib/queries/form-templates', () => ({ listFormTemplates: async () => [{ id: 1, name: 'T' }] }))
vi.mock('@/lib/queries/patients', () => ({ listPatientsWithStatus: async () => [] }))
vi.mock('@/lib/queries/appointments', () => ({ listAppointmentsInRange: async () => [] }))
vi.mock('@/components/PatientsByMonthChart', () => ({ PatientsByMonthChart: () => null }))
vi.mock('@/components/ScreeningBreakdownChart', () => ({ ScreeningBreakdownChart: () => null }))

async function renderAs(role: 'crc' | 'pi' | 'admin') {
  vi.mocked(auth.requireSessionOrRedirect).mockResolvedValue({ role, name: 'X' })
  render(await DashboardHomePage())
}

const formsLinks = () => screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/forms')

describe('home dashboard Form Templates tile', () => {
  // /forms is operations-only (admin, crc); a PI clicking this tile would
  // just bounce back to / -- a dead link.
  it('is not a link for a PI', async () => {
    await renderAs('pi')
    expect(formsLinks()).toHaveLength(0)
  })
  it.each(['crc', 'admin'] as const)('links to /forms for %s', async (role) => {
    await renderAs(role)
    expect(formsLinks()).toHaveLength(1)
  })
})

describe('home dashboard quick actions (Send Form to Client / Add New Patient)', () => {
  it('are not rendered for a PI', async () => {
    await renderAs('pi')
    expect(screen.queryByText('Send Form to Client')).toBeNull()
    expect(screen.queryByText('Add New Patient')).toBeNull()
  })
  it.each(['crc', 'admin'] as const)('are rendered for %s', async (role) => {
    await renderAs(role)
    expect(screen.getByText('Send Form to Client')).toBeInTheDocument()
    expect(screen.getByText('Add New Patient')).toBeInTheDocument()
  })
})

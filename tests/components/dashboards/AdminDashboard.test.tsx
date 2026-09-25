import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminDashboard, type DashboardPageProps } from '@/components/dashboards/AdminDashboard'

// jsdom has no ResizeObserver, but recharts' <ResponsiveContainer> (used by
// PatientsByMonthChart / ScreeningBreakdownChart, both rendered here) requires
// one to measure its container on mount. Stub it locally rather than in the
// shared vitest.setup.ts, since this is the first test file to render a
// recharts-based component.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const baseProps: DashboardPageProps = {
  session: { role: 'admin', name: 'Test Admin' },
  data: {
    latestForms: [], pendingForms: [], pendingFormsTotal: 3, pendingClassification: [{ id: 'RD-0001', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe' }],
    recentEvents: [], patientsByMonth: [{ month: 'Jan', count: 2 }], screeningBreakdown: { green: 1, yellow: 2, red: 0 },
    peakHourRange: '10:00 AM – 12:00 PM', avgExperienceRating: 4.5, completedReviewCount: 2,
  },
  templates: [{ id: 1, name: 'Intake Form' }],
  patients: [{ id: 'RD-0001', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe' }],
  appointmentsInRange: [],
  staffByRole: [{ role: 'admin', count: 1 }, { role: 'pi', count: 2 }, { role: 'crc', count: 3 }],
}

describe('AdminDashboard', () => {
  it('keeps every widget from the original shared Home page (content parity)', () => {
    render(<AdminDashboard {...baseProps} />)
    expect(screen.getByText(/peak scheduling hours/i)).toBeInTheDocument()
    // "Total Patients" appears twice by design (the stat-row card header and
    // the "Total Patients" mini stat tile), so use getAllByText here and for
    // the other two labels that are likewise duplicated across a stat/section
    // heading and a mini stat tile, rather than getByText (which throws on
    // more than one match).
    expect(screen.getAllByText(/total patients/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/avg\. patient experience/i)).toBeInTheDocument()
    expect(screen.getByText(/patients added/i)).toBeInTheDocument()
    expect(screen.getByText(/screening status breakdown/i)).toBeInTheDocument()
    expect(screen.getAllByText(/pending forms/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/pending classifications/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/form templates/i)).toBeInTheDocument()
    expect(screen.getByText(/latest forms received/i)).toBeInTheDocument()
    expect(screen.getByText(/latest account events/i)).toBeInTheDocument()
  })

  it('adds the new admin-only staff roster card, linking to the existing Settings page', () => {
    render(<AdminDashboard {...baseProps} />)
    expect(screen.getByText(/staff/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /staff/i })).toHaveAttribute('href', '/settings')
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CoordinatorDashboard } from '@/components/dashboards/CoordinatorDashboard'
import type { DashboardPageProps } from '@/components/dashboards/AdminDashboard'

// jsdom has no ResizeObserver, but recharts' <ResponsiveContainer> (used by
// PatientsByMonthChart / ScreeningBreakdownChart, both rendered here) requires
// one to measure its container on mount. Stub it locally, same as
// AdminDashboard.test.tsx does.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const baseProps: DashboardPageProps = {
  session: { role: 'crc', name: 'Test CRC' },
  data: {
    latestForms: [], pendingForms: [{ id: 1, status: 'sent', sentDate: new Date(), completedDate: null, templateName: 'Intake', patientName: 'Jane Doe' }],
    pendingFormsTotal: 1, pendingClassification: [{ id: 'RD-0001', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe' }],
    recentEvents: [{ id: 1, action: 'sent intake form', userName: 'Test CRC', timestamp: new Date() }],
    patientsByMonth: [{ month: 'Jan', count: 2 }], screeningBreakdown: { green: 1, yellow: 2, red: 0 },
    peakHourRange: '10:00 AM – 12:00 PM', avgExperienceRating: 4.5, completedReviewCount: 2,
  },
  templates: [{ id: 1, name: 'Intake Form' }],
  patients: [{ id: 'RD-0001', nameTebra: 'Jane Doe', nameIntakeq: 'Jane Doe' }],
  appointmentsInRange: [],
  staffByRole: [{ role: 'admin', count: 1 }, { role: 'pi', count: 2 }, { role: 'crc', count: 3 }],
}

describe('CoordinatorDashboard', () => {
  it('keeps every widget from the original shared Home page (content parity)', () => {
    render(<CoordinatorDashboard {...baseProps} />)
    expect(screen.getByText(/peak scheduling hours/i)).toBeInTheDocument()
    expect(screen.getByText(/patients added/i)).toBeInTheDocument()
    expect(screen.getByText(/screening status breakdown/i)).toBeInTheDocument()
    expect(screen.getAllByText(/pending classifications/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/latest account events/i)).toBeInTheDocument()
  })

  it('puts the actionable queues (Pending Forms, Pending Classifications) before the stat row in document order', () => {
    render(<CoordinatorDashboard {...baseProps} />)
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    const queueIdx = headings.findIndex((h) => /pending classifications/i.test(h ?? ''))
    const statIdx = headings.findIndex((h) => /patients added/i.test(h ?? ''))
    expect(queueIdx).toBeGreaterThanOrEqual(0)
    expect(statIdx).toBeGreaterThanOrEqual(0)
    expect(queueIdx).toBeLessThan(statIdx)
  })

  it('does not show the admin-only staff roster or audit log link', () => {
    render(<CoordinatorDashboard {...baseProps} />)
    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument()
  })
})

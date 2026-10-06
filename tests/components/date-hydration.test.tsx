import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { ReactElement } from 'react'
import { DashboardAppointmentsTable } from '@/components/DashboardAppointmentsTable'
import { FaxHistoryReportTable } from '@/components/FaxHistoryReportTable'
import { PatientStatementsTable } from '@/components/PatientStatementsTable'
import { UnsignedNotesReportTable } from '@/components/UnsignedNotesReportTable'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

// These client components are server-rendered and then hydrated in the
// browser. Any date text they compute themselves with toLocale*() depends
// on the runtime's timezone/locale, so the server's HTML and the browser's
// first render disagree whenever the two differ (React error #418, seen
// live on /, /documents/fax-history and /billing/statements with a browser
// in America/Los_Angeles against the server). Their markup must therefore
// be identical no matter which timezone renders it.
const ORIGINAL_TZ = process.env.TZ
afterEach(() => { process.env.TZ = ORIGINAL_TZ })

function renderIn(tz: string, el: () => ReactElement): string {
  process.env.TZ = tz
  return renderToString(el())
}

const ISO = '2026-09-30T23:30:00.000Z'

const CASES: [string, () => ReactElement][] = [
  ['DashboardAppointmentsTable', () => (
    <DashboardAppointmentsTable appointments={[{
      id: 1, patientId: 'RD-1', patientName: 'Pat', providerName: 'Dr. X', visitReason: 'Visit', status: 'scheduled',
      startsAt: ISO, dateLabel: 'Sep 30, 2026', timeLabel: '4:30 PM',
    }]} />
  )],
  ['FaxHistoryReportTable', () => (
    <FaxHistoryReportTable rows={[{
      id: 1, faxDate: ISO, faxDateLabel: '9/30/2026, 4:30:00 PM', subject: 'S', documentsIncluded: 'D', deliveryStatus: 'delivered',
      sender: 'Me', sentToFaxNumber: '555', patientId: null, patientName: null, patientDob: null,
    }]} />
  )],
  ['PatientStatementsTable', () => (
    <PatientStatementsTable statements={[{
      id: 1, patientId: 'RD-1', patientName: 'Pat', amountCents: 100, deliveryMethod: 'email', type: 'initial',
      deliveryStatus: 'delivered', sentDate: ISO, sentDateLabel: '9/30/2026',
    }]} />
  )],
  ['UnsignedNotesReportTable', () => (
    <UnsignedNotesReportTable rows={[{
      noteId: 1, patientId: 'RD-1', patientName: 'Pat', visitDate: ISO, visitDateLabel: '9/30/2026', noteType: 'Intake', status: 'Unsigned', assignedUser: 'Dr. X',
    }]} />
  )],
]

describe('server-rendered date text is timezone-independent (no hydration mismatch)', () => {
  it.each(CASES)('%s renders the same markup in UTC, Los Angeles and Tokyo', (_name, el) => {
    const utc = renderIn('UTC', el)
    expect(renderIn('America/Los_Angeles', el)).toBe(utc)
    expect(renderIn('Asia/Tokyo', el)).toBe(utc)
  })
})

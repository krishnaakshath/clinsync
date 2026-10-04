import { describe, it, expect } from 'vitest'
import { buildVisitConfirmationBody, formatVisitDate, formatVisitTime, WHAT_TO_BRING, INPATIENT_OVERNIGHT_BAG } from '@/lib/notification-templates'

const base = { providerName: 'Dr. Rajiv Kunam', startsAt: new Date(2026, 10, 3, 9, 0), visitReason: 'Follow-up', visitType: 'outpatient' as const }

describe('buildVisitConfirmationBody', () => {
  it('names provider, local day, local time and reason', () => {
    const body = buildVisitConfirmationBody(base)
    expect(body.startsWith('Your visit is confirmed.')).toBe(true)
    expect(body).toContain('Dr. Rajiv Kunam will see you on Tuesday, November 3, 2026 at 9:00 AM.')
    expect(body).toContain('Reason for visit: Follow-up')
    expect(body).toContain("If this time doesn't work, reply to this message and our front desk will help you change it.")
  })
  it('lists all five base bullets in order', () => {
    expect(WHAT_TO_BRING).toEqual([
      'A photo ID',
      'Your insurance card',
      'A current list of everything you take — prescriptions, over-the-counter medicines, vitamins and supplements — with the dose for each',
      "Any forms we sent you that you haven't finished yet",
      'A payment method, in case there is a copay due at the visit',
    ])
    const body = buildVisitConfirmationBody(base)
    for (const item of WHAT_TO_BRING) expect(body).toContain(`• ${item}`)
  })
  it('adds the overnight-bag bullet only for inpatient', () => {
    expect(INPATIENT_OVERNIGHT_BAG).toBe('An overnight bag — a few days of comfortable clothes and toiletries, and your medicines in their original labelled containers')
    expect(buildVisitConfirmationBody({ ...base, visitType: 'inpatient' })).toContain(`• ${INPATIENT_OVERNIGHT_BAG}`)
    expect(buildVisitConfirmationBody(base)).not.toContain('overnight bag')
  })
  it('renders 23:30 and 00:15 local on the local calendar day (reports.ts midnight trap)', () => {
    const late = new Date(2026, 10, 3, 23, 30)
    expect(formatVisitDate(late)).toBe('Tuesday, November 3, 2026')
    expect(formatVisitTime(late)).toBe('11:30 PM')
    const early = new Date(2026, 10, 4, 0, 15)
    expect(formatVisitDate(early)).toBe('Wednesday, November 4, 2026')
    expect(formatVisitTime(early)).toBe('12:15 AM')
    // Same day the patient portal's own formatter shows (local getters).
    expect(formatVisitDate(late)).toContain(String(late.getDate()))
  })
})

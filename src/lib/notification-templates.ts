// Fixed, pure patient-notification copy. No DB access, no patient-supplied text.
//
// Date/time rule (src/lib/queries/reports.ts:24-29): use LOCAL formatters only and
// never mix toISOString() (UTC) with a local formatter, or visits near midnight
// render on the wrong calendar day. practiceTimezone is deliberately unread.

export interface VisitConfirmationInput {
  providerName: string
  startsAt: Date
  visitReason: string
  visitType: 'inpatient' | 'outpatient'
}

// Node's ICU emits U+202F (narrow no-break space) / U+00A0 before AM/PM; normalize to ASCII.
function asciiSpaces(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

export function formatVisitDate(d: Date): string {
  return asciiSpaces(
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  )
}

export function formatVisitTime(d: Date): string {
  return asciiSpaces(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
}

export const WHAT_TO_BRING: readonly string[] = [
  'A photo ID',
  'Your insurance card',
  'A current list of everything you take — prescriptions, over-the-counter medicines, vitamins and supplements — with the dose for each',
  "Any forms we sent you that you haven't finished yet",
  'A payment method, in case there is a copay due at the visit',
]

export const INPATIENT_OVERNIGHT_BAG =
  'An overnight bag — a few days of comfortable clothes and toiletries, and your medicines in their original labelled containers'

export function buildVisitConfirmationBody(input: VisitConfirmationInput): string {
  const items = input.visitType === 'inpatient' ? [...WHAT_TO_BRING, INPATIENT_OVERNIGHT_BAG] : [...WHAT_TO_BRING]
  return [
    'Your visit is confirmed.',
    '',
    `${input.providerName} will see you on ${formatVisitDate(input.startsAt)} at ${formatVisitTime(input.startsAt)}.`,
    '',
    `Reason for visit: ${input.visitReason}`,
    '',
    'Please bring with you:',
    ...items.map((i) => `• ${i}`),
    '',
    "If this time doesn't work, reply to this message and our front desk will help you change it.",
  ].join('\n')
}

import type { charges, insuranceClaims, mockPayments } from '@/db/schema'

type Charge = typeof charges.$inferSelect
type InsuranceClaim = typeof insuranceClaims.$inferSelect
type MockPayment = typeof mockPayments.$inferSelect

export interface ChargeBalance {
  insurancePaidCents: number
  patientPaidCents: number
  unappliedPatientPaymentCents: number
  collectedCents: number
  outstandingCents: number
}

// The one place "insurance paid, then patient payment applied against the
// remainder, capped at the charge amount" is computed -- the AR dashboard,
// the billing-analytics trend, and the patient-collections list all need
// this exact math and must never compute it independently, since a future
// change (a rounding tweak, an overpayment-handling rule) applied to only
// one copy would silently produce inconsistent numbers across those three
// screens.
export function computeChargeBalance(charge: Charge, claims: InsuranceClaim[], payments: MockPayment[]): ChargeBalance {
  const insurancePaidCents = claims
    .filter((c) => c.chargeId === charge.id)
    .reduce((sum, c) => sum + (c.paidAmountCents ?? 0), 0)

  const amountDueFromPatientCents = Math.max(0, charge.amountCents - insurancePaidCents)

  const patientPaidRawCents = payments
    .filter((p) => p.chargeId === charge.id && p.result === 'success')
    .reduce((sum, p) => sum + p.amountCents, 0)

  const patientPaidCents = Math.min(patientPaidRawCents, amountDueFromPatientCents)
  const unappliedPatientPaymentCents = Math.max(0, patientPaidRawCents - patientPaidCents)
  const collectedCents = Math.min(charge.amountCents, insurancePaidCents + patientPaidCents)
  const outstandingCents = Math.max(0, charge.amountCents - collectedCents)

  return { insurancePaidCents, patientPaidCents, unappliedPatientPaymentCents, collectedCents, outstandingCents }
}

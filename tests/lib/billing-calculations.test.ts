import { describe, it, expect } from 'vitest'
import { computeChargeBalance } from '@/lib/billing-calculations'

function charge(amountCents: number, id = 1) {
  return { id, amountCents } as Parameters<typeof computeChargeBalance>[0]
}
function claim(chargeId: number, paidAmountCents: number | null) {
  return { chargeId, paidAmountCents } as Parameters<typeof computeChargeBalance>[1][number]
}
function payment(chargeId: number, amountCents: number, result: 'success' | 'failed' = 'success') {
  return { chargeId, amountCents, result } as Parameters<typeof computeChargeBalance>[2][number]
}

describe('computeChargeBalance', () => {
  it('applies insurance first, then patient payment against the remainder', () => {
    const c = charge(10000)
    const result = computeChargeBalance(c, [claim(1, 6000)], [payment(1, 4000)])
    expect(result.insurancePaidCents).toBe(6000)
    expect(result.patientPaidCents).toBe(4000)
    expect(result.collectedCents).toBe(10000)
    expect(result.outstandingCents).toBe(0)
    expect(result.unappliedPatientPaymentCents).toBe(0)
  })

  it('caps applied patient payment at the amount still owed, tracking the rest as unapplied', () => {
    const c = charge(10000)
    const result = computeChargeBalance(c, [claim(1, 8000)], [payment(1, 5000)])
    // Only $20 is owed after insurance; the patient paid $50.
    expect(result.patientPaidCents).toBe(2000)
    expect(result.unappliedPatientPaymentCents).toBe(3000)
    expect(result.outstandingCents).toBe(0)
  })

  it('ignores a failed payment entirely', () => {
    const c = charge(10000)
    const result = computeChargeBalance(c, [], [payment(1, 10000, 'failed')])
    expect(result.patientPaidCents).toBe(0)
    expect(result.outstandingCents).toBe(10000)
  })

  it('treats a null paidAmountCents on a claim as zero', () => {
    const c = charge(5000)
    const result = computeChargeBalance(c, [claim(1, null)], [])
    expect(result.insurancePaidCents).toBe(0)
    expect(result.outstandingCents).toBe(5000)
  })

  it('never lets collectedCents exceed the charge amount even if insurance overpays', () => {
    const c = charge(5000)
    const result = computeChargeBalance(c, [claim(1, 8000)], [payment(1, 1000)])
    expect(result.collectedCents).toBe(5000)
    expect(result.outstandingCents).toBe(0)
    expect(result.patientPaidCents).toBe(0)
    expect(result.unappliedPatientPaymentCents).toBe(1000)
  })

  it('ignores claims/payments belonging to a different charge', () => {
    const c = charge(5000, 1)
    const result = computeChargeBalance(c, [claim(2, 5000)], [payment(2, 5000)])
    expect(result.insurancePaidCents).toBe(0)
    expect(result.outstandingCents).toBe(5000)
  })
})

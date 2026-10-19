import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb } from '@/db/client'
import { payments, patients, charges } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { upsertPaymentFromTebra } from '@/lib/queries/payments'
import type { TebraPayment } from '@/connectors/types'

// Unique per test-run identifiers so repeated runs against the shared dev DB
// never collide with rows a previous run left behind.
//
// Unlike `upsertEncounterFromTebra`/`upsertAppointmentFromTebra`,
// `upsertPaymentFromTebra` does NOT resolve a raw Tebra patient id itself --
// per Task 3's connector report, real Tebra `PaymentData` carries no
// `PatientID` field at all, so `TebraPayment.patientId` is always `''` in
// the current pipeline. `TEST_PATIENT_ID` below stands in for an
// already-resolved `patients.id` a future caller would have to supply.
const TEST_PATIENT_ID = `RD-TEST-PMT-${Date.now()}`
const TEST_PAYMENT_TEBRA_ID = `tebra-test-payment-${Date.now()}`
const TEST_CHARGE_TEBRA_ID = `tebra-test-charge-pmt-${Date.now()}`
const TEST_UNMATCHED_CHARGE_TEBRA_ID = `tebra-test-charge-pmt-unmatched-${Date.now()}`

function basePayment(overrides: Partial<TebraPayment> = {}): TebraPayment {
  return {
    tebraId: TEST_PAYMENT_TEBRA_ID,
    patientId: TEST_PATIENT_ID,
    chargeId: null,
    appointmentId: null,
    payerName: 'Blue Cross',
    payerType: 'insurance',
    amountCents: 15000,
    method: 'EFT',
    postedDate: '2026-10-15',
    ...overrides,
  }
}

async function cleanup() {
  await getDb().delete(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
  await getDb().delete(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
}

beforeEach(async () => {
  await getDb().insert(patients).values({
    id: TEST_PATIENT_ID,
    intakeqClientIdRef: `ENC[test-pmt-${Date.now()}]`,
    tebraPatientIdRef: `ENC[tebra-test-patient-pmt-${Date.now()}]`,
    nameIntakeq: 'Test Patient',
    name: 'Test Patient',
    dobIntakeq: '1990-01-01',
    dob: '1990-01-01',
  })
})

afterEach(cleanup)

describe('upsertPaymentFromTebra', () => {
  it('no-ops cleanly (no throw, no insert) when patientId is blank -- the always-blank reality of today\'s real connector', async () => {
    await expect(upsertPaymentFromTebra(basePayment({ patientId: '' }))).resolves.toBeUndefined()

    const rows = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(rows.length).toBe(0)
  })

  it('succeeds when given a non-blank, already-resolved patientId (proving the function is correct and ready for a future caller)', async () => {
    await upsertPaymentFromTebra(basePayment())

    const rows = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(rows.length).toBe(1)
    expect(rows[0].patientId).toBe(TEST_PATIENT_ID)
    expect(rows[0].payerName).toBe('Blue Cross')
    expect(rows[0].amountCents).toBe(15000)
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertPaymentFromTebra(basePayment())

    const rowsAfterFirst = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].amountCents).toBe(15000)
    expect(rowsAfterFirst[0].method).toBe('EFT')

    await upsertPaymentFromTebra(basePayment({ amountCents: 20000, method: 'Check' }))

    const rowsAfterSecond = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].amountCents).toBe(20000)
    expect(rowsAfterSecond[0].method).toBe('Check')
  })

  it('resolves chargeId to the internal charges.id when the Tebra charge exists and matches', async () => {
    const [charge] = await getDb()
      .insert(charges)
      .values({
        patientId: TEST_PATIENT_ID,
        providerName: 'Dr. Payment Test',
        dateOfService: '2026-10-15',
        diagnosisCodes: [],
        procedureCodes: [],
        amountCents: 15000,
        status: 'approved',
        source: 'tebra',
        tebraId: TEST_CHARGE_TEBRA_ID,
      })
      .returning()

    await upsertPaymentFromTebra(basePayment({ chargeId: TEST_CHARGE_TEBRA_ID }))

    const [row] = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(row.chargeId).toBe(charge.id)
  })

  it('leaves chargeId null when the referenced Tebra charge has not been synced yet (does not block the payment)', async () => {
    await upsertPaymentFromTebra(basePayment({ chargeId: TEST_UNMATCHED_CHARGE_TEBRA_ID }))

    const [row] = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(row.chargeId).toBeNull()
  })

  it('leaves chargeId null when the Tebra payment itself has no chargeId', async () => {
    await upsertPaymentFromTebra(basePayment({ chargeId: null }))

    const [row] = await getDb().select().from(payments).where(eq(payments.tebraId, TEST_PAYMENT_TEBRA_ID))
    expect(row.chargeId).toBeNull()
  })
})

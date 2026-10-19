import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb } from '@/db/client'
import { charges, patients, encounters, providers, insuranceClaims } from '@/db/schema'
import { eq, like } from 'drizzle-orm'
import { upsertChargeFromTebra, TEBRA_CHARGE_PROVIDER_PLACEHOLDER } from '@/lib/queries/charges'
import type { TebraCharge } from '@/connectors/types'

// Unique per test-run identifiers so repeated runs against the shared dev DB
// never collide with rows a previous run left behind.
// `TEST_PATIENT_ID` is Clinsync's own internal id; `TEST_PATIENT_TEBRA_ID` is
// the raw Tebra id a TebraCharge payload would carry -- the two are
// unrelated strings (see resolvePatientIdFromTebraId's doc comment in
// appointments.ts), so the fixture patient must have its
// `tebraPatientIdRef` set explicitly, the same way `confirmIdentityMatch()`
// would in production.
const TEST_PATIENT_ID = `RD-TEST-CHG-${Date.now()}`
const TEST_PATIENT_TEBRA_ID = `tebra-test-patient-chg-${Date.now()}`
const TEST_UNMATCHED_PATIENT_TEBRA_ID = `tebra-test-patient-chg-unmatched-${Date.now()}`
const TEST_CHARGE_TEBRA_ID = `tebra-test-charge-${Date.now()}`
const TEST_ENCOUNTER_TEBRA_ID = `tebra-test-enc-${Date.now()}`
const TEST_PROVIDER_TEBRA_ID = `tebra-test-provider-chg-${Date.now()}`
const TEST_MISSING_ENCOUNTER_TEBRA_ID = `tebra-test-enc-missing-${Date.now()}`

function baseCharge(overrides: Partial<TebraCharge> = {}): TebraCharge {
  return {
    tebraId: TEST_CHARGE_TEBRA_ID,
    patientId: TEST_PATIENT_TEBRA_ID,
    encounterId: null,
    dateOfService: '2026-10-15',
    diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
    procedureCodes: [{ code: '90837', description: 'Psychotherapy, 60 minutes', units: 1, chargeCents: 15000 }],
    amountCents: 15000,
    status: 'approved',
    primaryInsurance: null,
    secondaryInsurance: null,
    tertiaryInsurance: null,
    ...overrides,
  }
}

async function cleanup() {
  await getDb().delete(insuranceClaims).where(like(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:%`))
  await getDb().delete(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
  await getDb().delete(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
  await getDb().delete(providers).where(eq(providers.tebraId, TEST_PROVIDER_TEBRA_ID))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
}

beforeEach(async () => {
  await getDb().insert(patients).values({
    id: TEST_PATIENT_ID,
    intakeqClientIdRef: `ENC[test-chg-${Date.now()}]`,
    tebraPatientIdRef: `ENC[${TEST_PATIENT_TEBRA_ID}]`,
    nameIntakeq: 'Test Patient',
    name: 'Test Patient',
    dobIntakeq: '1990-01-01',
    dob: '1990-01-01',
  })
})

afterEach(cleanup)

describe('upsertChargeFromTebra', () => {
  it('no-ops (no throw, no insert) when the Tebra patient has not been identity-matched into Clinsync yet', async () => {
    await expect(upsertChargeFromTebra(baseCharge({ patientId: TEST_UNMATCHED_PATIENT_TEBRA_ID }))).resolves.toBeUndefined()

    const rows = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(rows.length).toBe(0)
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertChargeFromTebra(baseCharge())

    const rowsAfterFirst = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].amountCents).toBe(15000)
    expect(rowsAfterFirst[0].status).toBe('approved')
    expect(rowsAfterFirst[0].source).toBe('tebra')
    expect(rowsAfterFirst[0].patientId).toBe(TEST_PATIENT_ID)

    await upsertChargeFromTebra(baseCharge({ amountCents: 20000, status: 'submitted' }))

    const rowsAfterSecond = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].amountCents).toBe(20000)
    expect(rowsAfterSecond[0].status).toBe('submitted')
  })

  it('resolves encounterId to the internal encounters.id when the Tebra encounter already exists', async () => {
    const [provider] = await getDb()
      .insert(providers)
      .values({ name: 'Dr. Charge Test', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: TEST_PROVIDER_TEBRA_ID })
      .returning()
    const [encounter] = await getDb()
      .insert(encounters)
      .values({
        tebraId: TEST_ENCOUNTER_TEBRA_ID,
        patientId: TEST_PATIENT_ID,
        providerId: provider.id,
        serviceLocationId: 1,
        serviceStartDate: '2026-10-15',
        serviceEndDate: '2026-10-15',
        status: 'completed',
      })
      .returning()

    await upsertChargeFromTebra(baseCharge({ encounterId: TEST_ENCOUNTER_TEBRA_ID }))

    const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(row.encounterId).toBe(encounter.id)
  })

  it('leaves encounterId null when the referenced Tebra encounter has not been synced yet', async () => {
    await upsertChargeFromTebra(baseCharge({ encounterId: TEST_MISSING_ENCOUNTER_TEBRA_ID }))

    const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(row.encounterId).toBeNull()
  })

  it('leaves encounterId null when the Tebra charge itself has no encounterId', async () => {
    await upsertChargeFromTebra(baseCharge({ encounterId: null }))

    const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(row.encounterId).toBeNull()
  })

  it('sets the documented placeholder providerName, since TebraCharge carries no provider field', async () => {
    await upsertChargeFromTebra(baseCharge())

    const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
    expect(row.providerName).toBe(TEBRA_CHARGE_PROVIDER_PLACEHOLDER)
  })

  it('never touches an existing source: clinsync charge row (conflict target only matches tebra-origin rows)', async () => {
    const before = await getDb().select().from(charges)
    const clinsyncCountBefore = before.filter((c) => c.source === 'clinsync').length

    await upsertChargeFromTebra(baseCharge())

    const after = await getDb().select().from(charges)
    const clinsyncCountAfter = after.filter((c) => c.source === 'clinsync').length
    expect(clinsyncCountAfter).toBe(clinsyncCountBefore)
  })

  // Fix C2b: status strings are mapped via explicit keyword matching, not
  // cast directly -- real values seen in a live Tebra fixture: "Approved"
  // (charge), "Insurance Payment" (insurance claim tier).
  describe('status mapping', () => {
    it('maps a real-world raw charge status cleanly ("Approved" -> approved), with no notes written', async () => {
      await upsertChargeFromTebra(baseCharge({ status: 'Approved' }))
      const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
      expect(row.status).toBe('approved')
      expect(row.notes).toBeNull()
    })

    it('falls back to draft for an unrecognized raw charge status, preserving the raw value in notes', async () => {
      await upsertChargeFromTebra(baseCharge({ status: 'Some Unrecognized Tebra Status' }))
      const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
      expect(row.status).toBe('draft')
      expect(row.notes).toBe('(Tebra status: "Some Unrecognized Tebra Status")')
    })

    it('maps a real-world raw insurance claim status cleanly ("Insurance Payment" -> paid), with no notes written', async () => {
      await upsertChargeFromTebra(baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 15000, status: 'Insurance Payment' } }))
      const [row] = await getDb().select().from(insuranceClaims).where(eq(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:primary`))
      expect(row.status).toBe('paid')
      expect(row.notes).toBeNull()
    })

    it('falls back to needs_investigation for an unrecognized raw insurance claim status, preserving the raw value in notes', async () => {
      await upsertChargeFromTebra(baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: null, status: 'Some Unrecognized Tebra Status' } }))
      const [row] = await getDb().select().from(insuranceClaims).where(eq(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:primary`))
      expect(row.status).toBe('needs_investigation')
      expect(row.notes).toBe('(Tebra status: "Some Unrecognized Tebra Status")')
    })

    // Re-review (fix round) found the plain substring match turned a negated
    // status into its positive opposite -- "Unapproved"/"Not Approved"
    // matched `approved`, "Not Submitted" matched `submitted`. These must
    // fall back (to `draft`, with the raw value preserved in notes), never
    // silently store the wrong terminal state.
    it.each(['Unapproved', 'Not Approved'])('falls back to draft (not approved) for raw charge status %j', async (raw) => {
      await upsertChargeFromTebra(baseCharge({ status: raw }))
      const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
      expect(row.status).toBe('draft')
      expect(row.notes).toBe(`(Tebra status: "${raw}")`)
    })

    it('falls back to draft (not submitted) for raw charge status "Not Submitted"', async () => {
      await upsertChargeFromTebra(baseCharge({ status: 'Not Submitted' }))
      const [row] = await getDb().select().from(charges).where(eq(charges.tebraId, TEST_CHARGE_TEBRA_ID))
      expect(row.status).toBe('draft')
      expect(row.notes).toBe('(Tebra status: "Not Submitted")')
    })

    // Same bug, insurance claim side: "Unpaid"/"Not Paid"/"Partially Paid"/
    // "Payment Pending" all matched `/paid|payment/`, storing `paid` for a
    // claim that is explicitly NOT paid (or only partially, or still
    // pending) -- a silently wrong terminal billing state.
    it.each(['Unpaid', 'Not Paid', 'Partially Paid', 'Payment Pending'])(
      'falls back to needs_investigation (not paid) for raw insurance claim status %j',
      async (raw) => {
        await upsertChargeFromTebra(baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 0, status: raw } }))
        const [row] = await getDb().select().from(insuranceClaims).where(eq(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:primary`))
        expect(row.status).toBe('needs_investigation')
        expect(row.notes).toBe(`(Tebra status: "${raw}")`)
      }
    )
  })

  describe('insuranceClaims', () => {
    it('upserts exactly one row per non-null tier when all three are populated', async () => {
      await upsertChargeFromTebra(
        baseCharge({
          primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 12000, status: 'paid' },
          secondaryInsurance: { payerName: 'Aetna', billedAmountCents: 3000, paidAmountCents: null, status: 'waiting_adjudication' },
          tertiaryInsurance: { payerName: 'Medicare', billedAmountCents: 0, paidAmountCents: 0, status: 'denied' },
        })
      )

      const rows = await getDb().select().from(insuranceClaims).where(like(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:%`))
      expect(rows.length).toBe(3)
      const byTier = Object.fromEntries(rows.map((r) => [r.tebraId, r]))
      expect(byTier[`${TEST_CHARGE_TEBRA_ID}:primary`].payerName).toBe('Blue Cross')
      expect(byTier[`${TEST_CHARGE_TEBRA_ID}:primary`].status).toBe('paid')
      expect(byTier[`${TEST_CHARGE_TEBRA_ID}:secondary`].payerName).toBe('Aetna')
      expect(byTier[`${TEST_CHARGE_TEBRA_ID}:tertiary`].payerName).toBe('Medicare')
      expect(rows.every((r) => r.patientId === TEST_PATIENT_ID)).toBe(true)
      expect(rows.every((r) => r.source === 'tebra')).toBe(true)
    })

    it('updates an existing tier row in place (not a duplicate) when re-synced with changed fields', async () => {
      await upsertChargeFromTebra(
        baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: null, status: 'waiting_adjudication' } })
      )
      const [firstRow] = await getDb().select().from(insuranceClaims).where(eq(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:primary`))
      expect(firstRow.status).toBe('waiting_adjudication')

      await upsertChargeFromTebra(
        baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 12000, status: 'paid' } })
      )
      const rowsAfter = await getDb().select().from(insuranceClaims).where(eq(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:primary`))
      expect(rowsAfter.length).toBe(1)
      expect(rowsAfter[0].id).toBe(firstRow.id)
      expect(rowsAfter[0].status).toBe('paid')
      expect(rowsAfter[0].paidAmountCents).toBe(12000)
    })

    it('leaves a previously-synced tier untouched when a later payload omits it (Tebra not reporting a tier is not the same as removing it)', async () => {
      await upsertChargeFromTebra(
        baseCharge({
          primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 12000, status: 'paid' },
          secondaryInsurance: { payerName: 'Aetna', billedAmountCents: 3000, paidAmountCents: null, status: 'waiting_adjudication' },
        })
      )
      const rowsAfterFirst = await getDb().select().from(insuranceClaims).where(like(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:%`))
      expect(rowsAfterFirst.length).toBe(2)

      // Second sync only reports primary -- secondary must survive untouched.
      await upsertChargeFromTebra(
        baseCharge({ primaryInsurance: { payerName: 'Blue Cross', billedAmountCents: 15000, paidAmountCents: 12000, status: 'paid' } })
      )

      const rowsAfterSecond = await getDb().select().from(insuranceClaims).where(like(insuranceClaims.tebraId, `${TEST_CHARGE_TEBRA_ID}:%`))
      expect(rowsAfterSecond.length).toBe(2)
      const secondaryRow = rowsAfterSecond.find((r) => r.tebraId === `${TEST_CHARGE_TEBRA_ID}:secondary`)
      expect(secondaryRow).toBeDefined()
      expect(secondaryRow?.payerName).toBe('Aetna')
    })
  })
})

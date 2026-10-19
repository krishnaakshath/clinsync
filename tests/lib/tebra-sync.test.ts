// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  syncCursors,
  syncRuns,
  patients,
  providers,
  serviceLocations,
  procedureCodes,
  encounters,
  charges,
  appointments,
  payments,
} from '@/db/schema'
import { runIncrementalSync, runReferenceSync } from '@/lib/tebra-sync'
import { claimCursor, releaseCursor } from '@/lib/queries/sync-cursors'
import { EhrConnectorError } from '@/connectors/errors'
import type {
  TebraConnector,
  TebraAppointment,
  TebraCharge,
  TebraPayment,
  TebraEncounterDetail,
} from '@/connectors/types'

// Every test below runs against the shared dev DB (no per-test isolation --
// see Task 4's review ruling), so every identifier is Date.now()-suffixed
// and every test registers its own cleanup via `onCleanup`, run in
// afterEach, matching the established pattern from Tasks 4-6's query tests.
let cleanupFns: Array<() => Promise<unknown>> = []
function onCleanup(fn: () => Promise<unknown>) {
  cleanupFns.push(fn)
}
afterEach(async () => {
  // Reverse (LIFO) order: a row registered later (e.g. an encounter or
  // payment referencing a test patient via FK) must be deleted before the
  // patient row registered earlier, or the delete violates the FK.
  const fns = cleanupFns.splice(0).reverse()
  for (const fn of fns) await fn()
})

function makeFakeConnector(overrides: Partial<TebraConnector> = {}): TebraConnector {
  const neverCalled = (name: string) => async () => {
    throw new Error(`${name} should never be called by the sync engine -- patients are out of scope (Correction 1)`)
  }
  return {
    supportsClinicalData: false,
    listPatients: neverCalled('listPatients'),
    searchPatient: neverCalled('searchPatient'),
    getPatientById: neverCalled('getPatientById'),
    createPatient: neverCalled('createPatient'),
    getActiveMedications: async () => [],
    getInactiveMedications: async () => [],
    getConditions: async () => [],
    getAppointments: async () => [],
    getCharges: async () => [],
    getPayments: async () => [],
    getProviders: async () => [],
    getServiceLocations: async () => [],
    getProcedureCodes: async () => [],
    getEncounterDetails: async () => null,
    testConnection: async () => {},
    ...overrides,
  }
}

async function insertTestPatient(id: string, tebraPatientId: string) {
  await getDb().insert(patients).values({
    id,
    intakeqClientIdRef: `ENC[test-tebra-sync-${id}]`,
    tebraPatientIdRef: `ENC[${tebraPatientId}]`,
    nameIntakeq: 'Test Patient',
    name: 'Test Patient',
    dobIntakeq: '1990-01-01',
    dob: '1990-01-01',
  })
  onCleanup(() => getDb().delete(patients).where(eq(patients.id, id)))
}

async function insertTestProvider(tebraId: string): Promise<number> {
  const [row] = await getDb()
    .insert(providers)
    .values({ name: 'Dr. Sync Test', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId })
    .returning()
  onCleanup(() => getDb().delete(providers).where(eq(providers.tebraId, tebraId)))
  return row.id
}

async function insertTestServiceLocation(tebraId: string): Promise<number> {
  const [row] = await getDb().insert(serviceLocations).values({ tebraId, name: 'Main Office' }).returning()
  onCleanup(() => getDb().delete(serviceLocations).where(eq(serviceLocations.tebraId, tebraId)))
  return row.id
}

function baseAppointment(overrides: Partial<TebraAppointment> = {}): TebraAppointment {
  return {
    tebraId: 'test-appt',
    patientId: 'test-patient',
    providerId: 'test-provider',
    startsAt: '2026-11-01T10:00:00Z',
    endsAt: '2026-11-01T11:00:00Z',
    visitReason: 'Initial consult',
    status: 'scheduled',
    ...overrides,
  }
}

function baseCharge(overrides: Partial<TebraCharge> = {}): TebraCharge {
  return {
    tebraId: 'test-charge',
    patientId: 'test-patient',
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

function basePayment(overrides: Partial<TebraPayment> = {}): TebraPayment {
  return {
    tebraId: 'test-payment',
    patientId: '',
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

function baseEncounterDetail(overrides: Partial<TebraEncounterDetail> = {}): TebraEncounterDetail {
  return {
    tebraId: 'test-encounter',
    patientId: 'test-patient',
    providerId: 'test-provider',
    serviceLocationId: 'test-location',
    serviceStartDate: '2026-10-15',
    serviceEndDate: '2026-10-15',
    status: 'completed',
    ...overrides,
  }
}

async function cursorRow(entityType: 'appointment' | 'charge' | 'payment' | 'provider' | 'serviceLocation' | 'procedureCode', practiceId: string) {
  const [row] = await getDb()
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.entityType, entityType), eq(syncCursors.practiceId, practiceId)))
  return row
}

async function runRows(entityType: 'appointment' | 'charge' | 'payment' | 'provider' | 'serviceLocation' | 'procedureCode', startedAt: Date) {
  return getDb()
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.entityType, entityType), eq(syncRuns.startedAt, startedAt)))
}

function registerCursorCleanup(entityType: 'appointment' | 'charge' | 'payment' | 'provider' | 'serviceLocation' | 'procedureCode', practiceId: string) {
  onCleanup(() => getDb().delete(syncCursors).where(and(eq(syncCursors.entityType, entityType), eq(syncCursors.practiceId, practiceId))))
}

function registerRunCleanup(entityType: 'appointment' | 'charge' | 'payment' | 'provider' | 'serviceLocation' | 'procedureCode', startedAt: Date) {
  onCleanup(() => getDb().delete(syncRuns).where(and(eq(syncRuns.entityType, entityType), eq(syncRuns.startedAt, startedAt))))
}

// Fix I4: on success, syncEntity releases the cursor to (fetchStartedAt -
// this overlap), NOT the time the attempt finished. When a test's fake
// now() is a single fixed value (never advances), fetchStartedAt ===
// finishedAt === fixedNow, so the released cursor is `fixedNow -
// WATERMARK_OVERLAP_MS`, not `fixedNow` itself.
const WATERMARK_OVERLAP_MS = 5 * 60 * 1000

describe('runIncrementalSync', () => {
  it('releases every entity cursor to fake now() even when all three fetches return empty (empty pull still advances the cursor)', async () => {
    const practiceId = `tebra-sync-test-empty-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const now = () => fixedNow
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    await runIncrementalSync(makeFakeConnector(), practiceId, now)

    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      const row = await cursorRow(entityType, practiceId)
      expect(row).toBeDefined()
      expect(row!.status).toBe('idle')
      expect(row!.lastSyncedAt).toEqual(new Date(fixedNow.getTime() - WATERMARK_OVERLAP_MS))

      const runs = await runRows(entityType, fixedNow)
      expect(runs.length).toBe(1)
      expect(runs[0].recordsProcessed).toBe(0)
      expect(runs[0].outcome).toBe('ok')
      expect(runs[0].errorKind).toBeNull()
    }
  })

  it('never calls any patient-related connector method (patients are out of scope)', async () => {
    const practiceId = `tebra-sync-test-no-patients-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // makeFakeConnector's listPatients/searchPatient/getPatientById/createPatient
    // all throw if invoked -- a passing run proves none of them were called.
    await expect(runIncrementalSync(makeFakeConnector(), practiceId, () => fixedNow)).resolves.toBeUndefined()
  })

  it('does not call getEncounterDetails a second time for an encounterId already present in encounters', async () => {
    const practiceId = `tebra-sync-test-dup-enc-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const patientId = `RD-TEST-SYNC-DUP-${suffix}`
    const patientTebraId = `tebra-sync-dup-patient-${suffix}`
    const providerTebraId = `tebra-sync-dup-provider-${suffix}`
    const locationTebraId = `tebra-sync-dup-location-${suffix}`
    const encounterTebraId = `tebra-sync-dup-encounter-${suffix}`
    const chargeTebraId = `tebra-sync-dup-charge-${suffix}`

    await insertTestPatient(patientId, patientTebraId)
    const providerId = await insertTestProvider(providerTebraId)
    const locationId = await insertTestServiceLocation(locationTebraId)
    const [existingEncounter] = await getDb()
      .insert(encounters)
      .values({
        tebraId: encounterTebraId,
        patientId,
        providerId,
        serviceLocationId: locationId,
        serviceStartDate: '2026-10-15',
        serviceEndDate: '2026-10-15',
        status: 'completed',
      })
      .returning()
    onCleanup(() => getDb().delete(encounters).where(eq(encounters.tebraId, encounterTebraId)))
    onCleanup(() => getDb().delete(charges).where(eq(charges.tebraId, chargeTebraId)))
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    let getEncounterDetailsCalls = 0
    const connector = makeFakeConnector({
      getCharges: async () => [baseCharge({ tebraId: chargeTebraId, patientId: patientTebraId, encounterId: encounterTebraId })],
      getEncounterDetails: async () => {
        getEncounterDetailsCalls++
        return null
      },
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    expect(getEncounterDetailsCalls).toBe(0)

    const [chargeRow] = await getDb().select().from(charges).where(eq(charges.tebraId, chargeTebraId))
    expect(chargeRow).toBeDefined()
    expect(chargeRow.encounterId).toBe(existingEncounter.id)
  })

  it('upserts the new encounter before upserting the charge, so a charge whose encounter is brand new this run still resolves a real encounterId', async () => {
    const practiceId = `tebra-sync-test-new-enc-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const patientId = `RD-TEST-SYNC-NEWENC-${suffix}`
    const patientTebraId = `tebra-sync-newenc-patient-${suffix}`
    const providerTebraId = `tebra-sync-newenc-provider-${suffix}`
    const locationTebraId = `tebra-sync-newenc-location-${suffix}`
    const encounterTebraId = `tebra-sync-newenc-encounter-${suffix}`
    const chargeTebraId = `tebra-sync-newenc-charge-${suffix}`

    await insertTestPatient(patientId, patientTebraId)
    await insertTestProvider(providerTebraId)
    await insertTestServiceLocation(locationTebraId)
    onCleanup(() => getDb().delete(encounters).where(eq(encounters.tebraId, encounterTebraId)))
    onCleanup(() => getDb().delete(charges).where(eq(charges.tebraId, chargeTebraId)))
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    let getEncounterDetailsCalls = 0
    const connector = makeFakeConnector({
      getCharges: async () => [baseCharge({ tebraId: chargeTebraId, patientId: patientTebraId, encounterId: encounterTebraId })],
      getEncounterDetails: async (id: string) => {
        getEncounterDetailsCalls++
        expect(id).toBe(encounterTebraId)
        return baseEncounterDetail({
          tebraId: encounterTebraId,
          patientId: patientTebraId,
          providerId: providerTebraId,
          serviceLocationId: locationTebraId,
        })
      },
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    expect(getEncounterDetailsCalls).toBe(1)

    const [encounterRow] = await getDb().select().from(encounters).where(eq(encounters.tebraId, encounterTebraId))
    expect(encounterRow).toBeDefined()

    const [chargeRow] = await getDb().select().from(charges).where(eq(charges.tebraId, chargeTebraId))
    expect(chargeRow).toBeDefined()
    expect(chargeRow.encounterId).toBe(encounterRow.id)
  })

  it('resolves a payment patientId via the stored appointments table (including an appointment synced earlier in this SAME run), and leaves it blank (no-op) when no match exists', async () => {
    const practiceId = `tebra-sync-test-payments-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const patientId = `RD-TEST-SYNC-PMT-${suffix}`
    const patientTebraId = `tebra-sync-pmt-patient-${suffix}`
    const providerTebraId = `tebra-sync-pmt-provider-${suffix}`
    const apptTebraId = `tebra-sync-pmt-appt-${suffix}`
    const resolvablePaymentTebraId = `tebra-sync-pmt-resolvable-${suffix}`
    const unresolvablePaymentTebraId = `tebra-sync-pmt-unresolvable-${suffix}`

    await insertTestPatient(patientId, patientTebraId)
    await insertTestProvider(providerTebraId)
    onCleanup(() => getDb().delete(appointments).where(eq(appointments.tebraId, apptTebraId)))
    onCleanup(() => getDb().delete(payments).where(eq(payments.tebraId, resolvablePaymentTebraId)))
    onCleanup(() => getDb().delete(payments).where(eq(payments.tebraId, unresolvablePaymentTebraId)))
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    const connector = makeFakeConnector({
      getAppointments: async () => [baseAppointment({ tebraId: apptTebraId, patientId: patientTebraId, providerId: providerTebraId })],
      getPayments: async () => [
        basePayment({ tebraId: resolvablePaymentTebraId, appointmentId: apptTebraId }),
        basePayment({ tebraId: unresolvablePaymentTebraId, appointmentId: null }),
      ],
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    const [resolvedRow] = await getDb().select().from(payments).where(eq(payments.tebraId, resolvablePaymentTebraId))
    expect(resolvedRow).toBeDefined()
    expect(resolvedRow.patientId).toBe(patientId)

    const unresolvedRows = await getDb().select().from(payments).where(eq(payments.tebraId, unresolvablePaymentTebraId))
    expect(unresolvedRows.length).toBe(0) // blank patientId -> upsertPaymentFromTebra no-ops cleanly
  })

  it('resolves a payment patientId via an appointment synced in a PRIOR, separate call -- the realistic "payment posted days after the visit" scenario (Fix I2)', async () => {
    const practiceId = `tebra-sync-test-payments-prior-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const patientId = `RD-TEST-SYNC-PMT-PRIOR-${suffix}`
    const patientTebraId = `tebra-sync-pmt-prior-patient-${suffix}`
    const providerTebraId = `tebra-sync-pmt-prior-provider-${suffix}`
    const apptTebraId = `tebra-sync-pmt-prior-appt-${suffix}`
    const paymentTebraId = `tebra-sync-pmt-prior-payment-${suffix}`

    await insertTestPatient(patientId, patientTebraId)
    const providerId = await insertTestProvider(providerTebraId)
    onCleanup(() => getDb().delete(payments).where(eq(payments.tebraId, paymentTebraId)))
    onCleanup(() => getDb().delete(appointments).where(eq(appointments.tebraId, apptTebraId)))
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // Simulate the appointment having been synced in an EARLIER, separate
    // run/seed -- not fetched by this run's connector at all (getAppointments
    // below returns []). The original in-run-only map design could never
    // have resolved this payment's patientId, since the appointment never
    // appears in THIS run's batch -- that was I2's core bug (payments posted
    // days after the visit, outside the appointment's own sync window).
    await getDb().insert(appointments).values({
      patientId,
      providerId,
      startsAt: new Date('2026-10-01T10:00:00Z'),
      endsAt: new Date('2026-10-01T11:00:00Z'),
      visitReason: 'Prior visit',
      status: 'completed',
      source: 'tebra',
      tebraId: apptTebraId,
    })

    const connector = makeFakeConnector({
      getAppointments: async () => [],
      getPayments: async () => [basePayment({ tebraId: paymentTebraId, appointmentId: apptTebraId })],
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    const [row] = await getDb().select().from(payments).where(eq(payments.tebraId, paymentTebraId))
    expect(row).toBeDefined()
    expect(row.patientId).toBe(patientId)
  })

  it('isolates a getCharges EhrConnectorError to the charge entity: its cursor is released with the OLD value and `failed`, while appointments still advances normally in the same run', async () => {
    const practiceId = `tebra-sync-test-isolation-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const oldCursor = new Date(Date.now() - 5_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // Simulate a prior successful charge sync so previousCursor is a real,
    // non-null watermark -- proves the OLD value (not an epoch sentinel) is
    // what gets reused on failure.
    await claimCursor('charge', practiceId)
    await releaseCursor('charge', practiceId, oldCursor, 'idle')

    const connector = makeFakeConnector({
      getCharges: async () => {
        throw new EhrConnectorError('tebra', 'vendor_error')
      },
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    const chargeCursor = await cursorRow('charge', practiceId)
    expect(chargeCursor!.status).toBe('failed')
    expect(chargeCursor!.lastSyncedAt).toEqual(oldCursor)

    const chargeRuns = await runRows('charge', fixedNow)
    expect(chargeRuns.length).toBe(1)
    expect(chargeRuns[0].outcome).toBe('failed')
    expect(chargeRuns[0].errorKind).toBe('vendor_error')
    expect(chargeRuns[0].recordsProcessed).toBe(0)

    const apptCursor = await cursorRow('appointment', practiceId)
    expect(apptCursor!.status).toBe('idle')
    expect(apptCursor!.lastSyncedAt).toEqual(new Date(fixedNow.getTime() - WATERMARK_OVERLAP_MS))

    const apptRuns = await runRows('appointment', fixedNow)
    expect(apptRuns.length).toBe(1)
    expect(apptRuns[0].outcome).toBe('ok')
  })

  it('reuses an epoch sentinel (not now()) when a first-ever attempt fails before any cursor existed', async () => {
    const practiceId = `tebra-sync-test-first-fail-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    const connector = makeFakeConnector({
      getCharges: async () => {
        throw new EhrConnectorError('tebra', 'network')
      },
    })

    await runIncrementalSync(connector, practiceId, () => fixedNow)

    const chargeCursor = await cursorRow('charge', practiceId)
    expect(chargeCursor!.status).toBe('failed')
    expect(chargeCursor!.lastSyncedAt).toEqual(new Date(0))
  })

  // Fix C1: syncEntity must catch ANY error, not just EhrConnectorError --
  // several of this codebase's own upsert functions throw a plain `Error` on
  // ordinary, expected real-world inputs.
  it('catches a plain Error (not EhrConnectorError) from an entity attempt: never rejects, releases the cursor to the OLD value, and records outcome `failed` / errorKind `unknown`', async () => {
    const practiceId = `tebra-sync-test-plain-error-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const oldCursor = new Date(Date.now() - 5_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // Simulate a prior successful charge sync so previousCursor is a real,
    // non-null watermark -- proves the OLD value (not an epoch sentinel) is
    // reused, same as the EhrConnectorError isolation test above.
    await claimCursor('charge', practiceId)
    await releaseCursor('charge', practiceId, oldCursor, 'idle')

    const connector = makeFakeConnector({
      getCharges: async () => {
        throw new Error('a plain, non-EhrConnectorError bug (e.g. an ordinary upsert throw on real-world data)')
      },
    })

    await expect(runIncrementalSync(connector, practiceId, () => fixedNow)).resolves.toBeUndefined()

    const chargeCursor = await cursorRow('charge', practiceId)
    expect(chargeCursor!.status).toBe('failed')
    expect(chargeCursor!.lastSyncedAt).toEqual(oldCursor)

    const chargeRuns = await runRows('charge', fixedNow)
    expect(chargeRuns.length).toBe(1)
    expect(chargeRuns[0].outcome).toBe('failed')
    expect(chargeRuns[0].errorKind).toBe('unknown')
    expect(chargeRuns[0].recordsProcessed).toBe(0)
  })

  it('isolates a plain Error (not just EhrConnectorError) to its own entity: charges/payments still run and their cursors still advance normally in the same call (Fix C1)', async () => {
    const practiceId = `tebra-sync-test-plain-error-isolation-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const patientId = `RD-TEST-SYNC-PLAINERR-${suffix}`
    const patientTebraId = `tebra-sync-plainerr-patient-${suffix}`
    const apptTebraId = `tebra-sync-plainerr-appt-${suffix}`

    await insertTestPatient(patientId, patientTebraId)
    onCleanup(() => getDb().delete(appointments).where(eq(appointments.tebraId, apptTebraId)))
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // upsertAppointmentFromTebra throws a plain `Error` (not EhrConnectorError)
    // when its providerId lookup misses -- a real, ordinary throw from this
    // codebase's own upsert layer on real-world data, not a contrived mock,
    // demonstrating exactly the kind of exception the review flagged as
    // reachable on day one.
    const connector = makeFakeConnector({
      getAppointments: async () => [baseAppointment({ tebraId: apptTebraId, patientId: patientTebraId, providerId: 'nonexistent-provider-tebra-id' })],
    })

    await expect(runIncrementalSync(connector, practiceId, () => fixedNow)).resolves.toBeUndefined()

    const apptCursor = await cursorRow('appointment', practiceId)
    expect(apptCursor!.status).toBe('failed')
    expect(apptCursor!.lastSyncedAt).toEqual(new Date(0)) // first-ever attempt for this practiceId -- epoch sentinel

    const apptRuns = await runRows('appointment', fixedNow)
    expect(apptRuns.length).toBe(1)
    expect(apptRuns[0].outcome).toBe('failed')
    expect(apptRuns[0].errorKind).toBe('unknown')

    const chargeCursor = await cursorRow('charge', practiceId)
    expect(chargeCursor!.status).toBe('idle')
    expect(chargeCursor!.lastSyncedAt).toEqual(new Date(fixedNow.getTime() - WATERMARK_OVERLAP_MS))

    const paymentCursor = await cursorRow('payment', practiceId)
    expect(paymentCursor!.status).toBe('idle')
    expect(paymentCursor!.lastSyncedAt).toEqual(new Date(fixedNow.getTime() - WATERMARK_OVERLAP_MS))
  })

  it('skips an entity whose cursor is already claimed by an overlapping run, without throwing and without recording a sync run for it -- other entities still proceed', async () => {
    const practiceId = `tebra-sync-test-overlap-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    // Simulate an overlapping run already owning the 'charge' cursor.
    const claimed = await claimCursor('charge', practiceId)
    expect(claimed).toBe(true) // sanity: this really is the first claim, so it really is held as 'running'

    let getChargesCalls = 0
    const connector = makeFakeConnector({
      getCharges: async () => {
        getChargesCalls++
        return []
      },
    })

    await expect(runIncrementalSync(connector, practiceId, () => fixedNow)).resolves.toBeUndefined()

    expect(getChargesCalls).toBe(0) // the charge entity was skipped entirely -- never fetched

    const chargeCursor = await cursorRow('charge', practiceId)
    expect(chargeCursor!.status).toBe('running') // untouched -- no release happened
    const chargeRuns = await runRows('charge', fixedNow)
    expect(chargeRuns.length).toBe(0) // nothing was attempted, so nothing was recorded

    const apptCursor = await cursorRow('appointment', practiceId)
    expect(apptCursor!.status).toBe('idle')
    const paymentCursor = await cursorRow('payment', practiceId)
    expect(paymentCursor!.status).toBe('idle')
  })

  // Fix I4: the released cursor must be based on when the attempt STARTED
  // (minus the overlap buffer), not when it FINISHED -- a fake now() that
  // advances between the two syncEntity now() calls on the success path
  // (startedAt, then finishedAt) simulates a slow attempt and proves this.
  it('releases the cursor based on when the attempt started (minus overlap), not when it finished', async () => {
    const practiceId = `tebra-sync-test-watermark-${Date.now()}`
    const t0 = new Date(Date.now() + 1_000_000)
    const tFinish = new Date(t0.getTime() + 10 * 60 * 1000) // simulate a slow attempt: 10 minutes elapse
    let callCount = 0
    const now = () => (++callCount % 2 === 1 ? t0 : tFinish) // odd calls = startedAt (t0), even calls = finishedAt (tFinish)

    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, t0)
    }

    await runIncrementalSync(makeFakeConnector(), practiceId, now)

    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      const row = await cursorRow(entityType, practiceId)
      // Released cursor is t0-based (start), not tFinish-based (finish) --
      // well before tFinish, specifically t0 - the overlap buffer.
      expect(row!.lastSyncedAt).toEqual(new Date(t0.getTime() - WATERMARK_OVERLAP_MS))
      expect(row!.lastSyncedAt.getTime()).toBeLessThan(tFinish.getTime())

      const runs = await runRows(entityType, t0)
      expect(runs.length).toBe(1)
      expect(runs[0].finishedAt).toEqual(tFinish) // recordSyncRun's finishedAt is still the real "now" when the attempt finished
    }
  })

  // Fix I4 (Task 7 review's missing test): discriminates the actual
  // `fromLastModifiedDate` filter VALUE passed to the connector by asserting
  // on what the fake connector's mock was actually called with, not just the
  // released cursor afterward.
  it('passes fromLastModifiedDate: undefined to the connector on a first-ever sync, and the real prior cursor\'s ISO value on a subsequent sync', async () => {
    const practiceId = `tebra-sync-test-filter-value-${Date.now()}`
    const fixedNow1 = new Date(Date.now() + 1_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow1)
    }

    let firstCallFilter: { fromLastModifiedDate?: string } | undefined
    const connector1 = makeFakeConnector({
      getAppointments: async (filter) => {
        firstCallFilter = filter
        return []
      },
    })
    await runIncrementalSync(connector1, practiceId, () => fixedNow1)

    expect(firstCallFilter).toEqual({ fromLastModifiedDate: undefined })

    // Second sync: previousCursor is now whatever the first run released it
    // to (fixedNow1 - overlap, per Fix I4) -- that real prior cursor's ISO
    // value must be what the connector is called with this time.
    const expectedCursor = new Date(fixedNow1.getTime() - WATERMARK_OVERLAP_MS)
    const fixedNow2 = new Date(fixedNow1.getTime() + 2_000_000)
    for (const entityType of ['appointment', 'charge', 'payment'] as const) {
      registerRunCleanup(entityType, fixedNow2)
    }

    let secondCallFilter: { fromLastModifiedDate?: string } | undefined
    const connector2 = makeFakeConnector({
      getAppointments: async (filter) => {
        secondCallFilter = filter
        return []
      },
    })
    await runIncrementalSync(connector2, practiceId, () => fixedNow2)

    expect(secondCallFilter).toEqual({ fromLastModifiedDate: expectedCursor.toISOString() })
  })
})

describe('runReferenceSync', () => {
  it('pulls providers, service locations, and procedure codes with no date filter, upserting each and releasing each cursor to fake now()', async () => {
    const practiceId = `tebra-sync-test-ref-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    const suffix = Date.now()
    const providerTebraId = `tebra-sync-ref-provider-${suffix}`
    const locationTebraId = `tebra-sync-ref-location-${suffix}`
    const codeTebraId = `tebra-sync-ref-code-${suffix}`

    for (const entityType of ['provider', 'serviceLocation', 'procedureCode'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }
    onCleanup(() => getDb().delete(providers).where(eq(providers.tebraId, providerTebraId)))
    onCleanup(() => getDb().delete(serviceLocations).where(eq(serviceLocations.tebraId, locationTebraId)))
    onCleanup(() => getDb().delete(procedureCodes).where(eq(procedureCodes.tebraId, codeTebraId)))

    let getProvidersCalls = 0
    let getServiceLocationsCalls = 0
    let getProcedureCodesCalls = 0
    const connector = makeFakeConnector({
      getProviders: async () => {
        getProvidersCalls++
        return [{ tebraId: providerTebraId, name: 'Dr. Ref Test', credentials: null, specialty: 'Psychiatry' }]
      },
      getServiceLocations: async () => {
        getServiceLocationsCalls++
        return [{ tebraId: locationTebraId, name: 'Main Office' }]
      },
      getProcedureCodes: async () => {
        getProcedureCodesCalls++
        return [{ tebraId: codeTebraId, code: '90837', description: 'Psychotherapy, 60 minutes' }]
      },
    })

    await runReferenceSync(connector, practiceId, () => fixedNow)

    expect(getProvidersCalls).toBe(1)
    expect(getServiceLocationsCalls).toBe(1)
    expect(getProcedureCodesCalls).toBe(1)

    for (const entityType of ['provider', 'serviceLocation', 'procedureCode'] as const) {
      const row = await cursorRow(entityType, practiceId)
      expect(row!.status).toBe('idle')
      expect(row!.lastSyncedAt).toEqual(new Date(fixedNow.getTime() - WATERMARK_OVERLAP_MS))
      const runs = await runRows(entityType, fixedNow)
      expect(runs.length).toBe(1)
      expect(runs[0].outcome).toBe('ok')
      expect(runs[0].recordsProcessed).toBe(1)
    }

    const [providerRow] = await getDb().select().from(providers).where(eq(providers.tebraId, providerTebraId))
    expect(providerRow).toBeDefined()
    const [locationRow] = await getDb().select().from(serviceLocations).where(eq(serviceLocations.tebraId, locationTebraId))
    expect(locationRow).toBeDefined()
    const [codeRow] = await getDb().select().from(procedureCodes).where(eq(procedureCodes.tebraId, codeTebraId))
    expect(codeRow).toBeDefined()
  })

  it('skips an entity whose cursor is already claimed by an overlapping run, without throwing', async () => {
    const practiceId = `tebra-sync-test-ref-overlap-${Date.now()}`
    const fixedNow = new Date(Date.now() + 1_000_000)
    for (const entityType of ['provider', 'serviceLocation', 'procedureCode'] as const) {
      registerCursorCleanup(entityType, practiceId)
      registerRunCleanup(entityType, fixedNow)
    }

    const claimed = await claimCursor('provider', practiceId)
    expect(claimed).toBe(true)

    let getProvidersCalls = 0
    const connector = makeFakeConnector({
      getProviders: async () => {
        getProvidersCalls++
        return []
      },
    })

    await expect(runReferenceSync(connector, practiceId, () => fixedNow)).resolves.toBeUndefined()
    expect(getProvidersCalls).toBe(0)

    const providerCursor = await cursorRow('provider', practiceId)
    expect(providerCursor!.status).toBe('running')
    const providerRuns = await runRows('provider', fixedNow)
    expect(providerRuns.length).toBe(0)

    const locationCursor = await cursorRow('serviceLocation', practiceId)
    expect(locationCursor!.status).toBe('idle')
  })
})

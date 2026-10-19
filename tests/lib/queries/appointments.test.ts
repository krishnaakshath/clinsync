import { describe, it, expect, afterEach } from 'vitest'
import { listAppointmentsInRange, listUpcomingAppointments, upsertAppointmentFromTebra } from '@/lib/queries/appointments'
import { listActiveProviders } from '@/lib/queries/providers'
import { getDb } from '@/db/client'
import { appointments, patients, providers } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('listAppointmentsInRange', () => {
  it('returns appointments within the given range, joined with patient and provider details', async () => {
    const results = await listAppointmentsInRange(new Date('2026-09-01T00:00:00'), new Date('2026-09-30T23:59:59'))
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('patientName')
    expect(results[0]).toHaveProperty('providerName')
    expect(results[0]).toHaveProperty('providerColorTag')
  })

  it('filters to only the given provider IDs when provided', async () => {
    const providers = await listActiveProviders()
    const oneProvider = [providers[0].id]
    const results = await listAppointmentsInRange(new Date('2026-09-01T00:00:00'), new Date('2026-09-30T23:59:59'), oneProvider)
    expect(results.every((r) => r.providerId === oneProvider[0])).toBe(true)
  })

  it('returns zero results for an explicitly empty provider filter (Uncheck All)', async () => {
    const results = await listAppointmentsInRange(new Date('2026-09-01T00:00:00'), new Date('2026-09-30T23:59:59'), [])
    expect(results).toEqual([])
  })
})

describe('listUpcomingAppointments', () => {
  it('returns only scheduled, future appointments, ordered soonest-first', async () => {
    const results = await listUpcomingAppointments(5)
    expect(results.every((r) => r.status === 'scheduled')).toBe(true)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].startsAt.getTime()).toBeGreaterThanOrEqual(results[i - 1].startsAt.getTime())
    }
  })
})

describe('upsertAppointmentFromTebra', () => {
  // Unique per test-run identifiers so repeated runs against the shared dev
  // DB never collide with rows a previous run left behind.
  // `testPatientId` is Clinsync's own internal id; `testPatientTebraId` is
  // the raw Tebra id a TebraAppointment payload would carry -- the two are
  // unrelated strings (see resolvePatientIdFromTebraId's doc comment), so
  // tests must set up the `patients.tebraPatientIdRef` mapping explicitly,
  // the same way `confirmIdentityMatch()` would in production.
  const testPatientId = `RD-TEST-APT-${Date.now()}`
  const testPatientTebraId = `tebra-test-patient-apt-${Date.now()}`
  const testProviderTebraId = `tebra-test-provider-apt-${Date.now()}`
  const testApptTebraId = `tebra-test-apt-${Date.now()}`
  const testUnmatchedPatientTebraId = `tebra-test-patient-unmatched-${Date.now()}`

  async function insertTestPatient() {
    await getDb().insert(patients).values({
      id: testPatientId,
      intakeqClientIdRef: `ENC[test-apt-${Date.now()}]`,
      tebraPatientIdRef: `ENC[${testPatientTebraId}]`,
      nameIntakeq: 'Test Patient',
      name: 'Test Patient',
      dobIntakeq: '1990-01-01',
      dob: '1990-01-01',
    })
  }

  afterEach(async () => {
    await getDb().delete(appointments).where(eq(appointments.tebraId, testApptTebraId))
    await getDb().delete(providers).where(eq(providers.tebraId, testProviderTebraId))
    await getDb().delete(patients).where(eq(patients.id, testPatientId))
  })

  it('no-ops (no throw, no insert) when the Tebra patient has not been identity-matched into Clinsync yet', async () => {
    await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })

    await expect(
      upsertAppointmentFromTebra({
        tebraId: testApptTebraId,
        patientId: testUnmatchedPatientTebraId,
        providerId: testProviderTebraId,
        // Offset-less, practice-local (Fix I5) -- see normalizeTebraDateTime's
        // doc comment: real TebraAppointment.startsAt/endsAt never carry a
        // 'Z'/offset suffix.
        startsAt: '2026-11-15T10:00:00',
        endsAt: '2026-11-15T11:00:00',
        visitReason: 'Initial consult',
        status: 'scheduled',
      })
    ).resolves.toBeUndefined()

    const rows = await getDb().select().from(appointments).where(eq(appointments.tebraId, testApptTebraId))
    expect(rows.length).toBe(0)
  })

  it('throws when no provider exists for the given Tebra providerId', async () => {
    await insertTestPatient()

    await expect(
      upsertAppointmentFromTebra({
        tebraId: testApptTebraId,
        patientId: testPatientTebraId,
        providerId: 'nonexistent-provider-tebra-id',
        startsAt: '2026-11-15T10:00:00',
        endsAt: '2026-11-15T11:00:00',
        visitReason: 'Initial consult',
        status: 'scheduled',
      })
    ).rejects.toThrow()
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await insertTestPatient()
    const [provider] = await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })
      .returning()

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientTebraId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-15T10:00:00',
      endsAt: '2026-11-15T11:00:00',
      visitReason: 'Initial consult',
      status: 'scheduled',
    })

    const rowsAfterFirst = await getDb().select().from(appointments).where(eq(appointments.tebraId, testApptTebraId))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].visitReason).toBe('Initial consult')
    expect(rowsAfterFirst[0].status).toBe('scheduled')
    expect(rowsAfterFirst[0].source).toBe('tebra')
    expect(rowsAfterFirst[0].providerId).toBe(provider.id)
    expect(rowsAfterFirst[0].patientId).toBe(testPatientId)
    // Fix I5: practice-local 10:00 on a standard-time (PST, UTC-8) date must
    // convert to 18:00 UTC via the practice's configured timezone (seeded as
    // 'America/Los_Angeles' in app_settings) -- NOT the bare
    // `new Date('2026-11-15T10:00:00')` server-local-timezone interpretation
    // this used to use.
    expect(rowsAfterFirst[0].startsAt.toISOString()).toBe('2026-11-15T18:00:00.000Z')
    expect(rowsAfterFirst[0].endsAt.toISOString()).toBe('2026-11-15T19:00:00.000Z')

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientTebraId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-15T13:00:00',
      endsAt: '2026-11-15T14:00:00',
      visitReason: 'Follow-up (changed)',
      status: 'completed',
    })

    const rowsAfterSecond = await getDb().select().from(appointments).where(eq(appointments.tebraId, testApptTebraId))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].visitReason).toBe('Follow-up (changed)')
    expect(rowsAfterSecond[0].status).toBe('completed')
    expect(rowsAfterSecond[0].startsAt.toISOString()).toBe('2026-11-15T21:00:00.000Z')
  })

  it('never touches an existing source: clinsync appointment row (conflict target only matches tebra-origin rows)', async () => {
    const before = await getDb().select().from(appointments)
    const clinsyncCountBefore = before.filter((a) => a.source === 'clinsync').length

    await insertTestPatient()
    await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientTebraId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-15T10:00:00',
      endsAt: '2026-11-15T11:00:00',
      visitReason: 'Initial consult',
      status: 'scheduled',
    })

    const after = await getDb().select().from(appointments)
    const clinsyncCountAfter = after.filter((a) => a.source === 'clinsync').length
    expect(clinsyncCountAfter).toBe(clinsyncCountBefore)
  })

  it('converts a daylight-saving-time (PDT, UTC-7) practice-local datetime correctly (Fix I5 -- DST-aware, not a fixed offset)', async () => {
    await insertTestPatient()
    await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientTebraId,
      providerId: testProviderTebraId,
      startsAt: '2026-07-15T10:00:00',
      endsAt: '2026-07-15T11:00:00',
      visitReason: 'Summer visit',
      status: 'scheduled',
    })

    const [row] = await getDb().select().from(appointments).where(eq(appointments.tebraId, testApptTebraId))
    expect(row.startsAt.toISOString()).toBe('2026-07-15T17:00:00.000Z')
    expect(row.endsAt.toISOString()).toBe('2026-07-15T18:00:00.000Z')
  })
})

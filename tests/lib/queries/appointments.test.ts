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
  const testPatientId = `RD-TEST-APT-${Date.now()}`
  const testProviderTebraId = `tebra-test-provider-apt-${Date.now()}`
  const testApptTebraId = `tebra-test-apt-${Date.now()}`

  afterEach(async () => {
    await getDb().delete(appointments).where(eq(appointments.tebraId, testApptTebraId))
    await getDb().delete(providers).where(eq(providers.tebraId, testProviderTebraId))
    await getDb().delete(patients).where(eq(patients.id, testPatientId))
  })

  it('throws when no provider exists for the given Tebra providerId', async () => {
    await expect(
      upsertAppointmentFromTebra({
        tebraId: testApptTebraId,
        patientId: testPatientId,
        providerId: 'nonexistent-provider-tebra-id',
        startsAt: '2026-11-01T10:00:00Z',
        endsAt: '2026-11-01T11:00:00Z',
        visitReason: 'Initial consult',
        status: 'scheduled',
      })
    ).rejects.toThrow()
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await getDb().insert(patients).values({
      id: testPatientId,
      intakeqClientIdRef: `ENC[test-apt-${Date.now()}]`,
      nameIntakeq: 'Test Patient',
      name: 'Test Patient',
      dobIntakeq: '1990-01-01',
      dob: '1990-01-01',
    })
    const [provider] = await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })
      .returning()

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-01T10:00:00Z',
      endsAt: '2026-11-01T11:00:00Z',
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

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-01T13:00:00Z',
      endsAt: '2026-11-01T14:00:00Z',
      visitReason: 'Follow-up (changed)',
      status: 'completed',
    })

    const rowsAfterSecond = await getDb().select().from(appointments).where(eq(appointments.tebraId, testApptTebraId))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].visitReason).toBe('Follow-up (changed)')
    expect(rowsAfterSecond[0].status).toBe('completed')
    expect(rowsAfterSecond[0].startsAt.toISOString()).toBe(new Date('2026-11-01T13:00:00Z').toISOString())
  })

  it('never touches an existing source: clinsync appointment row (conflict target only matches tebra-origin rows)', async () => {
    const before = await getDb().select().from(appointments)
    const clinsyncCountBefore = before.filter((a) => a.source === 'clinsync').length

    await getDb().insert(patients).values({
      id: testPatientId,
      intakeqClientIdRef: `ENC[test-apt2-${Date.now()}]`,
      nameIntakeq: 'Test Patient',
      name: 'Test Patient',
      dobIntakeq: '1990-01-01',
      dob: '1990-01-01',
    })
    await getDb()
      .insert(providers)
      .values({ name: 'Dr. Test Sync', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: testProviderTebraId })

    await upsertAppointmentFromTebra({
      tebraId: testApptTebraId,
      patientId: testPatientId,
      providerId: testProviderTebraId,
      startsAt: '2026-11-01T10:00:00Z',
      endsAt: '2026-11-01T11:00:00Z',
      visitReason: 'Initial consult',
      status: 'scheduled',
    })

    const after = await getDb().select().from(appointments)
    const clinsyncCountAfter = after.filter((a) => a.source === 'clinsync').length
    expect(clinsyncCountAfter).toBe(clinsyncCountBefore)
  })
})

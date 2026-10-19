import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb } from '@/db/client'
import { encounters, patients, providers, serviceLocations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { upsertEncounterFromTebra, getEncounterByTebraId } from '@/lib/queries/encounters'
import type { TebraEncounterDetail } from '@/connectors/types'

// Unique per test-run identifiers so repeated runs against the shared dev DB
// never collide with rows a previous run left behind.
// `TEST_PATIENT_ID` is Clinsync's own internal id; `TEST_PATIENT_TEBRA_ID` is
// the raw Tebra id a TebraEncounterDetail payload would carry -- the two are
// unrelated strings (see resolvePatientIdFromTebraId's doc comment in
// appointments.ts), so the fixture patient must have its
// `tebraPatientIdRef` set explicitly, the same way `confirmIdentityMatch()`
// would in production.
const TEST_PATIENT_ID = `RD-TEST-ENC-${Date.now()}`
const TEST_PATIENT_TEBRA_ID = `tebra-test-patient-enc-${Date.now()}`
const TEST_UNMATCHED_PATIENT_TEBRA_ID = `tebra-test-patient-enc-unmatched-${Date.now()}`
const TEST_ENCOUNTER_TEBRA_ID = `tebra-test-enc-${Date.now()}`
const TEST_PROVIDER_TEBRA_ID = `tebra-test-provider-enc-${Date.now()}`
const TEST_SERVICE_LOCATION_TEBRA_ID = `tebra-test-location-enc-${Date.now()}`

function baseEncounter(overrides: Partial<TebraEncounterDetail> = {}): TebraEncounterDetail {
  return {
    tebraId: TEST_ENCOUNTER_TEBRA_ID,
    patientId: TEST_PATIENT_TEBRA_ID,
    providerId: TEST_PROVIDER_TEBRA_ID,
    serviceLocationId: TEST_SERVICE_LOCATION_TEBRA_ID,
    serviceStartDate: '2026-10-15',
    serviceEndDate: '2026-10-15',
    status: 'completed',
    ...overrides,
  }
}

async function cleanup() {
  await getDb().delete(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
  await getDb().delete(providers).where(eq(providers.tebraId, TEST_PROVIDER_TEBRA_ID))
  await getDb().delete(serviceLocations).where(eq(serviceLocations.tebraId, TEST_SERVICE_LOCATION_TEBRA_ID))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
}

beforeEach(async () => {
  await getDb().insert(patients).values({
    id: TEST_PATIENT_ID,
    intakeqClientIdRef: `ENC[test-enc-${Date.now()}]`,
    tebraPatientIdRef: `ENC[${TEST_PATIENT_TEBRA_ID}]`,
    nameIntakeq: 'Test Patient',
    name: 'Test Patient',
    dobIntakeq: '1990-01-01',
    dob: '1990-01-01',
  })
  await getDb()
    .insert(providers)
    .values({ name: 'Dr. Encounter Test', specialty: 'Psychiatry', colorTag: 'chart-1', source: 'tebra', tebraId: TEST_PROVIDER_TEBRA_ID })
  await getDb().insert(serviceLocations).values({ tebraId: TEST_SERVICE_LOCATION_TEBRA_ID, name: 'Main Clinic' })
})

afterEach(cleanup)

describe('getEncounterByTebraId', () => {
  it('returns null before any upsert, and the row id after', async () => {
    expect(await getEncounterByTebraId(TEST_ENCOUNTER_TEBRA_ID)).toBeNull()

    await upsertEncounterFromTebra(baseEncounter())

    const [row] = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    const result = await getEncounterByTebraId(TEST_ENCOUNTER_TEBRA_ID)
    expect(result).toEqual({ id: row.id })
  })
})

describe('upsertEncounterFromTebra', () => {
  it('no-ops (no throw, no insert) when the Tebra patient has not been identity-matched into Clinsync yet', async () => {
    await expect(upsertEncounterFromTebra(baseEncounter({ patientId: TEST_UNMATCHED_PATIENT_TEBRA_ID }))).resolves.toBeUndefined()

    const rows = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    expect(rows.length).toBe(0)
  })

  // Fix C2a: a provider-lookup miss on BOTH the tebraId lookup and the
  // name-match fallback now no-ops cleanly instead of throwing -- changed
  // from the original throw-on-miss, since name matching is inherently less
  // certain than exact-id matching and a miss here is no longer assumed to
  // indicate a sync-ordering bug.
  it('no-ops (no throw, no insert) when neither a providerId match nor a providers.name match exists', async () => {
    await expect(upsertEncounterFromTebra(baseEncounter({ providerId: 'nonexistent-provider-tebra-id' }))).resolves.toBeUndefined()

    const rows = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    expect(rows.length).toBe(0)
  })

  it('resolves providerId via a case/whitespace-insensitive match against providers.name when the tebraId lookup misses (Fix C2a -- RenderingProvider is a free-text display name, not providers.tebraId)', async () => {
    const [provider] = await getDb().select().from(providers).where(eq(providers.tebraId, TEST_PROVIDER_TEBRA_ID))

    // "Dr. Encounter Test" (the seeded provider's real name) with different
    // casing and extra/collapsed whitespace -- proves normName's
    // trim/collapse-whitespace/lowercase convention, not just an exact match.
    await upsertEncounterFromTebra(baseEncounter({ providerId: '  dr.   encounter TEST  ' }))

    const [row] = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    expect(row).toBeDefined()
    expect(row.providerId).toBe(provider.id)
  })

  it('throws when no service location exists for the given Tebra serviceLocationId', async () => {
    await expect(upsertEncounterFromTebra(baseEncounter({ serviceLocationId: 'nonexistent-location-tebra-id' }))).rejects.toThrow()
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertEncounterFromTebra(baseEncounter())

    const rowsAfterFirst = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].patientId).toBe(TEST_PATIENT_ID)
    expect(rowsAfterFirst[0].status).toBe('completed')
    expect(rowsAfterFirst[0].serviceStartDate).toBe('2026-10-15')

    const [provider] = await getDb().select().from(providers).where(eq(providers.tebraId, TEST_PROVIDER_TEBRA_ID))
    const [serviceLocation] = await getDb().select().from(serviceLocations).where(eq(serviceLocations.tebraId, TEST_SERVICE_LOCATION_TEBRA_ID))
    expect(rowsAfterFirst[0].providerId).toBe(provider.id)
    expect(rowsAfterFirst[0].serviceLocationId).toBe(serviceLocation.id)

    await upsertEncounterFromTebra(baseEncounter({ serviceStartDate: '2026-10-20', serviceEndDate: '2026-10-21', status: 'cancelled' }))

    const rowsAfterSecond = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].serviceStartDate).toBe('2026-10-20')
    expect(rowsAfterSecond[0].serviceEndDate).toBe('2026-10-21')
    expect(rowsAfterSecond[0].status).toBe('cancelled')
  })

  // Fix C2b: status is mapped via the connector's mapAppointmentStatus
  // (reused, not duplicated) rather than cast directly into the enum.
  describe('status mapping', () => {
    it('maps a real-world raw Tebra status cleanly ("Completed" -> completed)', async () => {
      await upsertEncounterFromTebra(baseEncounter({ status: 'Completed' }))
      const [row] = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
      expect(row.status).toBe('completed')
    })

    it('falls back to the default status for an unrecognized raw value (encounters has no notes column to preserve it on)', async () => {
      await upsertEncounterFromTebra(baseEncounter({ status: 'Some Unrecognized Tebra Status' }))
      const [row] = await getDb().select().from(encounters).where(eq(encounters.tebraId, TEST_ENCOUNTER_TEBRA_ID))
      expect(row.status).toBe('scheduled') // mapAppointmentStatus's own documented fallback
    })
  })
})

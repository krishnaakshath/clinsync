import { describe, it, expect, afterEach } from 'vitest'
import { maybeAutoClassify } from '@/lib/auto-classify'
import { getDb } from '@/db/client'
import { appSettings, patients, diagnoses, patientTrialScreenings, screeningCriteriaResults, auditLog } from '@/db/schema'
import { eq, and, gt } from 'drizzle-orm'

const TEST_SESSION = { role: 'crc' as const, name: 'Test Runner' }
const TEST_PATIENT_ID = 'RD-9001'

// appSettings is a single-row table, but its row's serial id is whatever the
// seed happened to assign it -- never assume it's 1 (re-seeding across a
// session increments the sequence). Always look the row up first.
async function setAutoClassify(value: boolean) {
  const [row] = await getDb().select().from(appSettings)
  await getDb().update(appSettings).set({ autoClassifyOnComplete: value }).where(eq(appSettings.id, row.id))
}

async function cleanup() {
  await getDb().delete(screeningCriteriaResults).where(eq(screeningCriteriaResults.criterionKey, 'test-criterion'))
  await getDb().delete(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, TEST_PATIENT_ID))
  await getDb().delete(diagnoses).where(eq(diagnoses.patientId, TEST_PATIENT_ID))
  await getDb().delete(auditLog).where(and(eq(auditLog.patientId, TEST_PATIENT_ID), gt(auditLog.id, 0)))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
}

afterEach(cleanup)

describe('maybeAutoClassify', () => {
  it('is a no-op when the setting is off', async () => {
    await setAutoClassify(false)
    await expect(maybeAutoClassify('RD-0001', TEST_SESSION)).resolves.toBeUndefined()
  })

  it('recomputes the verdict and logs an audit entry when the setting is on and preconditions are met', async () => {
    // Many sequential Neon HTTP round-trips (cleanup + inserts + the function
    // itself) comfortably exceed vitest's default 5s test timeout.
    await cleanup()
    await setAutoClassify(true)
    await getDb().insert(patients).values({ id: TEST_PATIENT_ID, intakeqClientIdEncrypted: 'ENC[test]', nameIntakeq: 'Test Patient', dobIntakeq: '1990-01-01' })
    await getDb().insert(diagnoses).values({ patientId: TEST_PATIENT_ID, code: 'F33.1', description: 'Test diagnosis', source: 'tebra' })
    const [screening] = await getDb().insert(patientTrialScreenings).values({ patientId: TEST_PATIENT_ID, trialId: 'nct06911112', overallStatus: 'yellow' }).returning()
    await getDb().insert(screeningCriteriaResults).values({ screeningId: screening.id, criterionKey: 'test-criterion', criterionText: 'Test criterion', verdict: 'green' })

    await maybeAutoClassify(TEST_PATIENT_ID, TEST_SESSION)

    const [updated] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.id, screening.id))
    expect(updated.overallStatus).toBe('green')

    const auditEntries = await getDb().select().from(auditLog).where(eq(auditLog.patientId, TEST_PATIENT_ID))
    expect(auditEntries.some((e) => e.action.startsWith('auto-classified patient'))).toBe(true)

    await setAutoClassify(false)
  }, 15000)
})

// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { users, patients } from '@/db/schema'
import { hashPassword } from '@/lib/password'
import {
  getUserMfaState, getUserNameById, setUserMfaSecret, enableUserMfa, resetUserMfa,
} from '@/lib/queries/users'
import {
  getPatientMfaState, setPatientMfaSecret, enablePatientMfa, resetPatientMfa,
} from '@/lib/queries/patient-portal'
import {
  getAdminMfaState, setAdminMfaSecret, enableAdminMfa, resetAdminMfa,
} from '@/lib/queries/settings'

const TEST_USER_EMAIL = 'test-mfa-state-user@example.com'
const TEST_PATIENT_ID = 'RD-MFA-TEST-01'
let testUserId: number

beforeAll(async () => {
  const [row] = await getDb().insert(users).values({ name: 'MFA Test User', email: TEST_USER_EMAIL, role: 'crc', passwordHash: hashPassword('irrelevant') }).returning()
  testUserId = row.id
  await getDb().insert(patients).values({
    id: TEST_PATIENT_ID, intakeqClientIdRef: 'ENC[test]', nameIntakeq: 'MFA Test Patient', dobIntakeq: '1990-01-01',
  })
})

afterAll(async () => {
  await getDb().delete(users).where(eq(users.id, testUserId))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
  await resetAdminMfa() // leave the singleton appSettings row clean for other tests
})

describe('user MFA state', () => {
  it('starts unenrolled', async () => {
    expect(await getUserMfaState(testUserId)).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
  })
  it('provisions a secret without enabling', async () => {
    await setUserMfaSecret(testUserId, 'encrypted-secret')
    expect(await getUserMfaState(testUserId)).toEqual({ mfaSecretEncrypted: 'encrypted-secret', mfaEnabled: false })
  })
  it('enables after confirmation', async () => {
    await enableUserMfa(testUserId)
    expect(await getUserMfaState(testUserId)).toEqual({ mfaSecretEncrypted: 'encrypted-secret', mfaEnabled: true })
  })
  it('resets to unenrolled', async () => {
    await resetUserMfa(testUserId)
    expect(await getUserMfaState(testUserId)).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
  })
  it('looks up a name by id', async () => {
    expect(await getUserNameById(testUserId)).toBe('MFA Test User')
    expect(await getUserNameById(-1)).toBeNull()
  })
})

describe('patient MFA state', () => {
  it('starts unenrolled, then provisions, enables, and resets', async () => {
    expect(await getPatientMfaState(TEST_PATIENT_ID)).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
    await setPatientMfaSecret(TEST_PATIENT_ID, 'encrypted-secret')
    expect((await getPatientMfaState(TEST_PATIENT_ID))?.mfaEnabled).toBe(false)
    await enablePatientMfa(TEST_PATIENT_ID)
    expect((await getPatientMfaState(TEST_PATIENT_ID))?.mfaEnabled).toBe(true)
    await resetPatientMfa(TEST_PATIENT_ID)
    expect(await getPatientMfaState(TEST_PATIENT_ID)).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
  })
})

describe('admin MFA state (appSettings singleton)', () => {
  it('starts unenrolled, then provisions, enables, and resets', async () => {
    await resetAdminMfa()
    expect(await getAdminMfaState()).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
    await setAdminMfaSecret('encrypted-admin-secret')
    expect((await getAdminMfaState()).mfaEnabled).toBe(false)
    await enableAdminMfa()
    expect((await getAdminMfaState()).mfaEnabled).toBe(true)
    await resetAdminMfa()
    expect(await getAdminMfaState()).toEqual({ mfaSecretEncrypted: null, mfaEnabled: false })
  })
})

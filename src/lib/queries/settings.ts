import { getDb } from '@/db/client'
import { appSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { encryptSensitive } from '@/lib/crypto'

// Single-row settings table: always operate on row id 1 (created by the seed).
export async function getAppSettings() {
  const [row] = await getDb().select().from(appSettings)
  return row ?? { id: 1, autoClassifyOnComplete: false, practiceName: null, practiceSite: null, practiceTimezone: 'America/Los_Angeles', intakeqApiKeyEncrypted: null, tebraCustomerKeyEncrypted: null, tebraUserEncrypted: null, tebraPasswordEncrypted: null, adminMfaSecretEncrypted: null, adminMfaEnabled: false }
}

// What the Settings page actually renders -- booleans for whether each EHR
// credential is on file, never the encrypted value itself. The page is a
// Server Component that only ever needs "is this configured", and there's
// no reason to let a decrypted or even still-encrypted credential travel
// any further than this query layer.
export async function getSettingsSummary() {
  const settings = await getAppSettings()
  return {
    autoClassifyOnComplete: settings.autoClassifyOnComplete,
    practiceName: settings.practiceName,
    practiceSite: settings.practiceSite,
    practiceTimezone: settings.practiceTimezone,
    intakeqConfigured: !!settings.intakeqApiKeyEncrypted,
    tebraConfigured: !!(settings.tebraCustomerKeyEncrypted && settings.tebraUserEncrypted && settings.tebraPasswordEncrypted),
  }
}

export async function updateAutoClassifySetting(value: boolean) {
  const current = await getAppSettings()
  await getDb().update(appSettings).set({ autoClassifyOnComplete: value }).where(eq(appSettings.id, current.id))
}

export async function updatePracticeInfo(input: { practiceName: string; practiceSite: string; practiceTimezone: string }) {
  const current = await getAppSettings()
  await getDb().update(appSettings).set(input).where(eq(appSettings.id, current.id))
}

export interface EhrCredentialsInput {
  intakeqApiKey?: string
  tebraCustomerKey?: string
  tebraUser?: string
  tebraPassword?: string
}

// A blank/omitted field means "leave the existing credential unchanged" --
// the page never shows a stored key back to re-submit, so a save action
// that only touches one side (e.g. just fixing a typo'd Tebra password)
// must not overwrite the other side with nothing.
export async function updateEhrCredentials(input: EhrCredentialsInput) {
  const current = await getAppSettings()
  const patch: Record<string, string> = {}
  if (input.intakeqApiKey) patch.intakeqApiKeyEncrypted = encryptSensitive(input.intakeqApiKey)
  if (input.tebraCustomerKey) patch.tebraCustomerKeyEncrypted = encryptSensitive(input.tebraCustomerKey)
  if (input.tebraUser) patch.tebraUserEncrypted = encryptSensitive(input.tebraUser)
  if (input.tebraPassword) patch.tebraPasswordEncrypted = encryptSensitive(input.tebraPassword)
  if (Object.keys(patch).length === 0) return
  await getDb().update(appSettings).set(patch).where(eq(appSettings.id, current.id))
}

export async function getAdminMfaState(): Promise<{ mfaSecretEncrypted: string | null; mfaEnabled: boolean }> {
  const settings = await getAppSettings()
  return { mfaSecretEncrypted: settings.adminMfaSecretEncrypted, mfaEnabled: settings.adminMfaEnabled }
}

export async function setAdminMfaSecret(secretEncrypted: string): Promise<void> {
  const current = await getAppSettings()
  await getDb().update(appSettings).set({ adminMfaSecretEncrypted: secretEncrypted }).where(eq(appSettings.id, current.id))
}

export async function enableAdminMfa(): Promise<void> {
  const current = await getAppSettings()
  await getDb().update(appSettings).set({ adminMfaEnabled: true }).where(eq(appSettings.id, current.id))
}

export async function resetAdminMfa(): Promise<void> {
  const current = await getAppSettings()
  await getDb().update(appSettings).set({ adminMfaSecretEncrypted: null, adminMfaEnabled: false }).where(eq(appSettings.id, current.id))
}

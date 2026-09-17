import { getDb } from '@/db/client'
import { appSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Single-row settings table: always operate on row id 1 (created by the seed).
export async function getAppSettings() {
  const [row] = await getDb().select().from(appSettings)
  return row ?? { id: 1, autoClassifyOnComplete: false }
}

export async function updateAutoClassifySetting(value: boolean) {
  const current = await getAppSettings()
  await getDb().update(appSettings).set({ autoClassifyOnComplete: value }).where(eq(appSettings.id, current.id))
}

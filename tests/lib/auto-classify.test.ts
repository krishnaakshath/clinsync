import { describe, it, expect } from 'vitest'
import { maybeAutoClassify } from '@/lib/auto-classify'
import { getDb } from '@/db/client'
import { appSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('maybeAutoClassify', () => {
  it('is a no-op when the setting is off', async () => {
    await getDb().update(appSettings).set({ autoClassifyOnComplete: false }).where(eq(appSettings.id, 1))
    await expect(maybeAutoClassify('RD-0001')).resolves.toBeUndefined()
  })
})

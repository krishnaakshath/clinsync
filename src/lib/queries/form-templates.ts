import { getDb } from '@/db/client'
import { formTemplates, formSubmissions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, formTemplatesListCacheKey } from '@/lib/cache'

export async function listFormTemplates() {
  return getOrSetCache(formTemplatesListCacheKey(), 30, async () => {
    return getDb().select().from(formTemplates)
  })
}

export async function getFormTemplate(id: number) {
  const [template] = await getDb().select().from(formTemplates).where(eq(formTemplates.id, id))
  return template ?? null
}

export async function invalidateFormTemplatesList() {
  await invalidateCache(formTemplatesListCacheKey())
}

/**
 * A template with any form submission against it can't be deleted outright
 * -- a FK violation would otherwise surface as a raw 500, and the
 * submission history itself is a real record that must survive. Deactivating
 * (isActive: false, via PUT) is the correct move once a template has been
 * used; deleting stays available for the "created it, never sent it" case.
 */
export async function deleteFormTemplate(id: number): Promise<'deleted' | 'in_use' | 'not_found'> {
  const db = getDb()
  const [existing] = await db.select().from(formTemplates).where(eq(formTemplates.id, id))
  if (!existing) return 'not_found'

  const [inUse] = await db.select({ id: formSubmissions.id }).from(formSubmissions).where(eq(formSubmissions.templateId, id)).limit(1)
  if (inUse) return 'in_use'

  await db.delete(formTemplates).where(eq(formTemplates.id, id))
  await invalidateFormTemplatesList()
  return 'deleted'
}

import { getDb } from '@/db/client'
import { providers } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, providersListCacheKey } from '@/lib/cache'

export async function listActiveProviders() {
  return getOrSetCache(providersListCacheKey(), 60, async () => {
    return getDb().select().from(providers).where(eq(providers.isActive, true))
  })
}

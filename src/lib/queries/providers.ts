import { getDb } from '@/db/client'
import { providers } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, providersListCacheKey } from '@/lib/cache'
import type { TebraProvider } from '@/connectors/types'

// Matches the cycle the seed roster uses (src/db/seed.ts) for the design
// system's grayscale chart tokens -- see the schema comment on
// `providers.colorTag`.
const PROVIDER_COLOR_TAGS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

export async function listActiveProviders() {
  return getOrSetCache(providersListCacheKey(), 60, async () => {
    return getDb().select().from(providers).where(eq(providers.isActive, true))
  })
}

/** Full roster (active and inactive) for the Settings > Provider Profiles panel. */
export async function listAllProviders() {
  return getDb().select().from(providers)
}

/** Name-only edit — Provider Profiles is a lightweight roster editor, not a full provider-management form. */
export async function updateProviderName(id: number, name: string) {
  const [updated] = await getDb().update(providers).set({ name }).where(eq(providers.id, id)).returning()
  await invalidateCache(providersListCacheKey())
  return updated ?? null
}

/**
 * Upserts a provider synced from Tebra, matched on `tebraId` -- inserts if
 * absent, updates if present. Never touches a `source: 'clinsync'` row: the
 * unique index on `tebraId` (Task 1) is partial (`WHERE tebra_id IS NOT
 * NULL`), so `ON CONFLICT` inference needs `targetWhere` to match that
 * predicate, confirmed directly against
 * `node_modules/drizzle-orm/pg-core/query-builders/insert.d.ts`. A
 * clinsync-origin roster row always has `tebraId: null`, so it can never be
 * the row Postgres finds conflicting here -- a conflicting tebraId can only
 * belong to a row this same sync path inserted earlier.
 *
 * `colorTag` is a pure display concern (see the schema comment on
 * `providers`), assigned by cycling through the same chart-1..chart-5
 * tokens the seed roster uses -- but only computed for the INSERT branch;
 * re-syncing an existing provider never reassigns its already-picked color.
 */
export async function upsertProviderFromTebra(data: TebraProvider): Promise<void> {
  const db = getDb()
  const [{ count }] = await db.select({ count: sql<string>`count(*)` }).from(providers)
  const colorTag = PROVIDER_COLOR_TAGS[Number(count) % PROVIDER_COLOR_TAGS.length]

  await db
    .insert(providers)
    .values({
      name: data.name,
      credentials: data.credentials,
      specialty: data.specialty,
      colorTag,
      isActive: true,
      source: 'tebra',
      tebraId: data.tebraId,
    })
    .onConflictDoUpdate({
      target: [providers.tebraId],
      targetWhere: sql`${providers.tebraId} is not null`,
      set: {
        name: data.name,
        credentials: data.credentials,
        specialty: data.specialty,
      },
    })

  await invalidateCache(providersListCacheKey())
}

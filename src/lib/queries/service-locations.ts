import { getDb } from '@/db/client'
import { serviceLocations } from '@/db/schema'
import type { TebraServiceLocation } from '@/connectors/types'

/**
 * Upserts a service location synced from Tebra, matched on `tebraId` --
 * inserts if absent, updates if present.
 *
 * Unlike `providers`/`appointments`/`charges` (Task 1's partial unique
 * index, since those tables carry `source: 'clinsync'` rows with a null
 * `tebraId`), `serviceLocations.tebraId` is `text(...).notNull()` with a
 * PLAIN unique index (no `source` column on this table at all -- it's
 * Tebra-only reference data, confirmed directly against `src/db/schema.ts`).
 * So the bare `target: [serviceLocations.tebraId]` below is correct and
 * sufficient -- no `targetWhere` needed, and adding one would in fact be
 * wrong: Postgres's `ON CONFLICT` inference won't match a plain unique index
 * against a clause with a `WHERE` predicate when the index itself has none.
 */
export async function upsertServiceLocationFromTebra(data: TebraServiceLocation): Promise<void> {
  const db = getDb()
  await db
    .insert(serviceLocations)
    .values({
      tebraId: data.tebraId,
      name: data.name,
    })
    .onConflictDoUpdate({
      target: [serviceLocations.tebraId],
      set: {
        name: data.name,
      },
    })
}

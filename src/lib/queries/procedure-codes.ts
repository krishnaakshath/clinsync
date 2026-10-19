import { getDb } from '@/db/client'
import { procedureCodes } from '@/db/schema'
import type { TebraProcedureCode } from '@/connectors/types'

/**
 * Upserts a procedure code synced from Tebra, matched on `tebraId` --
 * inserts if absent, updates if present.
 *
 * Same reasoning as `upsertServiceLocationFromTebra`: `procedureCodes` has
 * no `source` column and `tebraId` is `text(...).notNull()` with a PLAIN
 * unique index (confirmed against `src/db/schema.ts`), so a bare
 * `target: [procedureCodes.tebraId]` is correct here -- no `targetWhere`.
 */
export async function upsertProcedureCodeFromTebra(data: TebraProcedureCode): Promise<void> {
  const db = getDb()
  await db
    .insert(procedureCodes)
    .values({
      tebraId: data.tebraId,
      code: data.code,
      description: data.description,
    })
    .onConflictDoUpdate({
      target: [procedureCodes.tebraId],
      set: {
        code: data.code,
        description: data.description,
      },
    })
}

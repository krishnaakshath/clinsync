import { getDb } from '@/db/client'
import { syncRuns } from '@/db/schema'
import type { SyncCursorEntity } from '@/lib/queries/sync-cursors'
import type { EhrErrorKind } from '@/connectors/errors'

/** Appends one row to the sync run log -- a permanent audit trail of every sync attempt. */
export async function recordSyncRun(
  entityType: SyncCursorEntity,
  startedAt: Date,
  finishedAt: Date,
  recordsProcessed: number,
  outcome: 'ok' | 'partial' | 'failed',
  // Widened locally (not on EhrErrorKind itself -- that type is used
  // elsewhere for real vendor-error classification, e.g. messageFor()'s
  // exhaustive switch, and widening it there would ripple into places that
  // don't need this) to also accept the literal 'unknown', which syncEntity
  // (tebra-sync.ts) now records for any non-EhrConnectorError exception
  // (Fix C1) -- syncRuns.errorKind is a plain `text` column, not a DB enum,
  // so no migration is needed for this.
  errorKind?: EhrErrorKind | 'unknown',
): Promise<void> {
  await getDb().insert(syncRuns).values({
    entityType,
    startedAt,
    finishedAt,
    recordsProcessed,
    outcome,
    errorKind: errorKind ?? null,
  })
}

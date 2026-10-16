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
  errorKind?: EhrErrorKind,
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

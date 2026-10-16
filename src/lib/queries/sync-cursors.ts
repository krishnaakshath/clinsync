import { getDb } from '@/db/client'
import { syncCursors, syncCursorEntityEnum } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'

export type SyncCursorEntity = (typeof syncCursorEntityEnum.enumValues)[number]

/** Per (entityType, practiceId) bookkeeping row's "last synced" watermark. Null = never synced. */
export async function getCursor(entityType: SyncCursorEntity, practiceId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ lastSyncedAt: syncCursors.lastSyncedAt })
    .from(syncCursors)
    .where(and(eq(syncCursors.entityType, entityType), eq(syncCursors.practiceId, practiceId)))
  return row ? row.lastSyncedAt : null
}

/**
 * Atomically claims the sync cursor for (entityType, practiceId), so two
 * overlapping cron ticks can never both process the same entity type for the
 * same practice concurrently. Returns true iff this call won the claim.
 *
 * This has to be a single UPSERT statement, not a SELECT-then-write -- a
 * separate read-then-decide-then-write would race under concurrent callers.
 * `ON CONFLICT (entity_type, practice_id) DO UPDATE ... WHERE status !=
 * 'running'` gives us the atomic check-and-set in one round trip:
 *   - no row yet              -> INSERT branch runs, claim granted.
 *   - row exists, idle/failed -> UPDATE's WHERE guard matches, claim granted.
 *   - row exists, running     -> UPDATE's WHERE guard excludes the row, so
 *                                 the DO UPDATE affects 0 rows and RETURNING
 *                                 yields nothing -- claim denied.
 */
export async function claimCursor(entityType: SyncCursorEntity, practiceId: string): Promise<boolean> {
  const claimed = await getDb()
    .insert(syncCursors)
    .values({
      entityType,
      practiceId,
      // lastSyncedAt is NOT NULL, but this is the very first claim ever for
      // this (entityType, practiceId) pair -- no real sync has completed
      // yet. An epoch sentinel is safe here because the only call order used
      // elsewhere in this plan is getCursor() (returns null while no row
      // exists yet) -> claimCursor() (auto-creates this placeholder row if
      // needed) -> the real sync work -> releaseCursor() (overwrites the
      // placeholder with a real timestamp). getCursor() is never called in
      // the gap between claimCursor's auto-create and releaseCursor's real
      // write, so this placeholder never surfaces as a false "already
      // synced" signal to any caller.
      lastSyncedAt: new Date(0),
      status: 'running',
    })
    .onConflictDoUpdate({
      target: [syncCursors.entityType, syncCursors.practiceId],
      set: { status: 'running', updatedAt: new Date() },
      setWhere: sql`${syncCursors.status} != 'running'`,
    })
    .returning({ id: syncCursors.id })
  return claimed.length > 0
}

/** Releases a previously claimed cursor, recording the real watermark and final status. */
export async function releaseCursor(
  entityType: SyncCursorEntity,
  practiceId: string,
  lastSyncedAt: Date,
  outcome: 'idle' | 'failed',
): Promise<void> {
  await getDb()
    .update(syncCursors)
    .set({ status: outcome, lastSyncedAt, updatedAt: new Date() })
    .where(and(eq(syncCursors.entityType, entityType), eq(syncCursors.practiceId, practiceId)))
}

// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { syncCursors } from '@/db/schema'
import { getCursor, claimCursor, releaseCursor } from '@/lib/queries/sync-cursors'

// Unique per test-run practiceId values so repeated runs against the shared
// dev DB never collide with a row a previous run left behind (or with any
// other entity/practice pair another suite might use).
const PRACTICE_FIRST_CLAIM = `sync-cursor-test-first-claim-${Date.now()}`
const PRACTICE_CONCURRENT = `sync-cursor-test-concurrent-${Date.now()}`
const PRACTICE_RELEASE = `sync-cursor-test-release-${Date.now()}`
const PRACTICE_REACQUIRE = `sync-cursor-test-reacquire-${Date.now()}`

async function deleteCursorRow(practiceId: string) {
  await getDb().delete(syncCursors).where(and(eq(syncCursors.entityType, 'appointment'), eq(syncCursors.practiceId, practiceId)))
}

afterEach(async () => {
  await Promise.all([
    deleteCursorRow(PRACTICE_FIRST_CLAIM),
    deleteCursorRow(PRACTICE_CONCURRENT),
    deleteCursorRow(PRACTICE_RELEASE),
    deleteCursorRow(PRACTICE_REACQUIRE),
  ])
})

describe('claimCursor', () => {
  it('returns true on the very first call ever for an entity/practice pair (no pre-existing row)', async () => {
    // Guard: prove there really is no row yet, so a true result here can only
    // come from the auto-create/INSERT branch, not a leftover row.
    const existing = await getDb()
      .select()
      .from(syncCursors)
      .where(and(eq(syncCursors.entityType, 'appointment'), eq(syncCursors.practiceId, PRACTICE_FIRST_CLAIM)))
    expect(existing.length).toBe(0)

    const claimed = await claimCursor('appointment', PRACTICE_FIRST_CLAIM)
    expect(claimed).toBe(true)

    const [row] = await getDb()
      .select()
      .from(syncCursors)
      .where(and(eq(syncCursors.entityType, 'appointment'), eq(syncCursors.practiceId, PRACTICE_FIRST_CLAIM)))
    expect(row).toBeDefined()
    expect(row.status).toBe('running')
  })

  it('returns false on a second concurrent call before releaseCursor runs', async () => {
    const first = await claimCursor('appointment', PRACTICE_CONCURRENT)
    expect(first).toBe(true)

    const second = await claimCursor('appointment', PRACTICE_CONCURRENT)
    expect(second).toBe(false)
  })

  it('returns true again after a prior releaseCursor set status back to idle', async () => {
    expect(await claimCursor('appointment', PRACTICE_REACQUIRE)).toBe(true)
    await releaseCursor('appointment', PRACTICE_REACQUIRE, new Date('2026-01-01T00:00:00Z'), 'idle')

    const reclaimed = await claimCursor('appointment', PRACTICE_REACQUIRE)
    expect(reclaimed).toBe(true)
  })

  it('returns true again after a prior releaseCursor set status to failed', async () => {
    expect(await claimCursor('appointment', PRACTICE_REACQUIRE)).toBe(true)
    await releaseCursor('appointment', PRACTICE_REACQUIRE, new Date('2026-01-01T00:00:00Z'), 'failed')

    const reclaimed = await claimCursor('appointment', PRACTICE_REACQUIRE)
    expect(reclaimed).toBe(true)
  })
})

describe('getCursor', () => {
  it('returns null before any releaseCursor has ever run', async () => {
    expect(await getCursor('appointment', PRACTICE_RELEASE)).toBeNull()
  })

  it('returns the passed lastSyncedAt after releaseCursor runs', async () => {
    await claimCursor('appointment', PRACTICE_RELEASE)
    const syncedAt = new Date('2026-05-15T12:30:00Z')
    await releaseCursor('appointment', PRACTICE_RELEASE, syncedAt, 'idle')

    const result = await getCursor('appointment', PRACTICE_RELEASE)
    expect(result).toEqual(syncedAt)
  })
})

describe('releaseCursor', () => {
  it('sets status to idle and lastSyncedAt on a successful outcome', async () => {
    await claimCursor('appointment', PRACTICE_RELEASE)
    const syncedAt = new Date('2026-06-01T00:00:00Z')
    await releaseCursor('appointment', PRACTICE_RELEASE, syncedAt, 'idle')

    const [row] = await getDb()
      .select()
      .from(syncCursors)
      .where(and(eq(syncCursors.entityType, 'appointment'), eq(syncCursors.practiceId, PRACTICE_RELEASE)))
    expect(row.status).toBe('idle')
    expect(row.lastSyncedAt).toEqual(syncedAt)
  })

  it('sets status to failed on a failed outcome', async () => {
    await claimCursor('appointment', PRACTICE_RELEASE)
    const syncedAt = new Date('2026-06-02T00:00:00Z')
    await releaseCursor('appointment', PRACTICE_RELEASE, syncedAt, 'failed')

    const [row] = await getDb()
      .select()
      .from(syncCursors)
      .where(and(eq(syncCursors.entityType, 'appointment'), eq(syncCursors.practiceId, PRACTICE_RELEASE)))
    expect(row.status).toBe('failed')
    expect(row.lastSyncedAt).toEqual(syncedAt)
  })
})

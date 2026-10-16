// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { syncRuns } from '@/db/schema'
import { recordSyncRun } from '@/lib/queries/sync-runs'

// A startedAt timestamp unique to this test run (the real current time, down
// to the millisecond), used as a collision-proof marker to find (and clean
// up) only the rows this file inserted, rather than a fixed literal that
// could collide with another run against the shared dev DB.
const RUN_MARKER = Date.now()
const startedAtForTest = (offsetMs: number) => new Date(RUN_MARKER + offsetMs)
const insertedStartedAts: Date[] = []

afterEach(async () => {
  await Promise.all(
    insertedStartedAts.splice(0).map((startedAt) =>
      getDb().delete(syncRuns).where(and(eq(syncRuns.entityType, 'charge'), eq(syncRuns.startedAt, startedAt))),
    ),
  )
})

describe('recordSyncRun', () => {
  it('inserts a row readable back with all fields intact', async () => {
    const startedAt = startedAtForTest(0)
    const finishedAt = new Date(startedAt.getTime() + 5000)
    insertedStartedAts.push(startedAt)

    await recordSyncRun('charge', startedAt, finishedAt, 42, 'ok')

    const [row] = await getDb()
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.entityType, 'charge'), eq(syncRuns.startedAt, startedAt)))
    expect(row).toBeDefined()
    expect(row.entityType).toBe('charge')
    expect(row.startedAt).toEqual(startedAt)
    expect(row.finishedAt).toEqual(finishedAt)
    expect(row.recordsProcessed).toBe(42)
    expect(row.outcome).toBe('ok')
    expect(row.errorKind).toBeNull()
  })

  it('records an optional errorKind on a failed outcome', async () => {
    const startedAt = startedAtForTest(1)
    const finishedAt = new Date(startedAt.getTime() + 1000)
    insertedStartedAts.push(startedAt)

    await recordSyncRun('charge', startedAt, finishedAt, 0, 'failed', 'rate_limited')

    const [row] = await getDb()
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.entityType, 'charge'), eq(syncRuns.startedAt, startedAt)))
    expect(row.outcome).toBe('failed')
    expect(row.errorKind).toBe('rate_limited')
  })
})

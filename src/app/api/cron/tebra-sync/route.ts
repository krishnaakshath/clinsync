import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getEhrConnectors } from '@/connectors'
import { runIncrementalSync, DEFAULT_PRACTICE_ID } from '@/lib/tebra-sync'

// Vercel Cron's documented auth convention: every real cron request to this
// route carries `Authorization: Bearer ${CRON_SECRET}` (see vercel.json).
// This must be checked, and must fail closed, BEFORE any credential loading
// or sync invocation below -- it's the only thing standing between this
// route and an open HTTP trigger for a real Tebra sync.
// Fix I6: matches the precedent set by
// api/settings/ehr-connections/sync/route.ts (real Tebra calls are rate
// limited, >= 1s apart -- a large pull can take a while).
//
// On a large first-ever backfill, 300s may not be enough for a single tick
// to finish. That's OK and does NOT need a chunking/windowing redesign here:
// after Fix C1 (syncEntity catches ANY error and never wedges a cursor at
// 'running' -- paired with claimCursor's stale-lease reclaim), a function
// killed mid-attempt by Vercel's time budget never reaches releaseCursor at
// all, so the NEXT cron tick's getCursor() still returns the SAME old
// previousCursor this tick started from -- it simply resumes from where it
// left off, not from scratch and not skipping ahead. Repeated 300s ticks
// therefore make forward progress through a large backfill via many partial
// attempts. True chunked/windowed backfill (better throughput per tick, vs.
// re-walking already-seen records within one attempt before the kill point)
// remains a documented future improvement, not fixed in this round.
export const maxDuration = 300

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  // Guard the length before timingSafeEqual, which throws on a length
  // mismatch instead of returning false (same pattern as password.ts's
  // verifyPassword).
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tebra } = await getEhrConnectors()
  if (!tebra) {
    // Not an error -- the practice's Tebra account isn't configured yet.
    // Mirrors testEhrConnections()'s treatment of "not configured" as a
    // normal, expected state: a 10-minute cron tick with nothing to do
    // should return 200, not fail/page anyone.
    return NextResponse.json({ ok: true, ran: false, reason: 'Tebra is not configured' })
  }

  await runIncrementalSync(tebra, DEFAULT_PRACTICE_ID)
  return NextResponse.json({ ok: true, ran: true })
}

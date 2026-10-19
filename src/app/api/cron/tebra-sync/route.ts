import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getEhrConnectors } from '@/connectors'
import { runIncrementalSync, DEFAULT_PRACTICE_ID } from '@/lib/tebra-sync'

// Vercel Cron's documented auth convention: every real cron request to this
// route carries `Authorization: Bearer ${CRON_SECRET}` (see vercel.json).
// This must be checked, and must fail closed, BEFORE any credential loading
// or sync invocation below -- it's the only thing standing between this
// route and an open HTTP trigger for a real Tebra sync.
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

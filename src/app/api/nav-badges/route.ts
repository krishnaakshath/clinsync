import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { getNavBadges } from '@/lib/nav-badges'

// Live LeftNav counts. The dashboard layout computes the initial badges on
// a full render only (layouts don't re-render on client navigation), so the
// client polls this to keep them fresh. getNavBadges never throws -- on
// failure it returns {} (no badge), never a guessed number.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const badges = await getNavBadges(session)
  return NextResponse.json({ badges }, { headers: { 'Cache-Control': 'no-store' } })
}

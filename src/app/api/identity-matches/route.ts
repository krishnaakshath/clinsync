import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPendingIdentityMatches } from '@/lib/queries/identity-matches'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  // Same allowlist as LeftNav.tsx:34's Identity Matching nav entry.
  if (!['admin', 'crc'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const matches = await listPendingIdentityMatches()
  await logAudit(session, 'viewed identity matching queue', null)
  return NextResponse.json({ matches })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { listPendingIdentityMatches } from '@/lib/queries/identity-matches'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const matches = await listPendingIdentityMatches()
  return NextResponse.json({ matches })
}

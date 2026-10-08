import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { listPendingIdentityMatches } from '@/lib/queries/identity-matches'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const matches = await listPendingIdentityMatches()
  await logAudit(session, 'viewed identity matching queue', null)
  return NextResponse.json({ matches })
}

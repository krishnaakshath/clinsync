import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listAllTrials } from '@/lib/queries/trials'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  await logAudit(session, 'viewed trials list', null)
  const rows = await listAllTrials()
  return NextResponse.json({ trials: rows })
}

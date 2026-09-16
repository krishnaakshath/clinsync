import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { listAuditLog } from '@/lib/queries/audit-log'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const entries = await listAuditLog()
  return NextResponse.json({ entries })
}

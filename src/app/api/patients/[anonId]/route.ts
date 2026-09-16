import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { getPatientDetail } from '@/lib/queries/patients'

export async function GET(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { anonId } = await params

  const detail = await getPatientDetail(anonId)

  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'viewed patient detail', anonId)

  return NextResponse.json(detail)
}

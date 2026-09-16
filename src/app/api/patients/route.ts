import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { listPatientsWithStatus } from '@/lib/queries/patients'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const trialId = request.nextUrl.searchParams.get('trialId')
  const patientsWithStatus = await listPatientsWithStatus(trialId)

  await logAudit(session, 'viewed patient list', null)

  return NextResponse.json({ patients: patientsWithStatus })
}

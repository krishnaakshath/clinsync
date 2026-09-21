import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { getPatientDetail, deletePatient } from '@/lib/queries/patients'

export async function GET(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { anonId } = await params

  const detail = await getPatientDetail(anonId)

  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'viewed patient detail', anonId)

  return NextResponse.json(detail)
}

// Admin-only: permanently removes a patient chart (and everything that
// references it) from Clinsync -- for correcting a real mistake, e.g. a
// duplicate created by a mis-confirmed identity match, or a chart added
// with wrong details. Never touches Tebra/IntakeQ; this only un-mirrors the
// chart from Clinsync's own copy.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { anonId } = await params
  const deleted = await deletePatient(anonId)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'deleted patient record', anonId)

  return NextResponse.json({ ok: true })
}

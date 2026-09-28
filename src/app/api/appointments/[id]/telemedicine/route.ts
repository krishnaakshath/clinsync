import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getAppointment } from '@/lib/queries/appointments'
import { createTelemedicineSession } from '@/lib/queries/telemedicine-sessions'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['admin', 'pi'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appointmentId = Number(id)
  if (!Number.isInteger(appointmentId)) return NextResponse.json({ error: 'Invalid appointment id' }, { status: 400 })

  const appointment = await getAppointment(appointmentId)
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  const result = await createTelemedicineSession(appointmentId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  await logAudit(session, 'started telemedicine session', appointment.patientId)
  return NextResponse.json({ id: result.session!.id, patientJoinToken: result.session!.patientJoinToken }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getAppointment } from '@/lib/queries/appointments'
import { createTelemedicineSession, getSessionByAppointmentId } from '@/lib/queries/telemedicine-sessions'

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
  if (!result.ok) {
    // Recover the already-existing session's id/token so a staff member who
    // refreshed (or double-clicked) before copying the link on the first
    // create can retry and get the same join link back, instead of a
    // dead-end error with no way to reach the call. See
    // StartTelemedicineButton.tsx, which renders the same copy-link UI on
    // this 409 body as it does on a fresh 201.
    const existing = await getSessionByAppointmentId(appointmentId)
    return NextResponse.json({ error: result.error, id: existing?.id, patientJoinToken: existing?.patientJoinToken }, { status: 409 })
  }

  await logAudit(session, 'started telemedicine session', appointment.patientId)
  return NextResponse.json({ id: result.session!.id, patientJoinToken: result.session!.patientJoinToken }, { status: 201 })
}

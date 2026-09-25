import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { assignRoomToPatient } from '@/lib/queries/rooms'
import { createDoctorAssignment } from '@/lib/queries/doctor-assignments'

const checkInSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.number().int().positive(),
  visitType: z.enum(['inpatient', 'outpatient']),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
  reason: z.string().min(1),
  roomId: z.number().int().positive().optional(),
}).strict()

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['frontdesk', 'admin', 'crc'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = checkInSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid check-in payload', details: parsed.error.flatten() }, { status: 400 })

  const { patientId, providerId, visitType, urgency, reason, roomId } = parsed.data

  if (visitType === 'inpatient' && !roomId) {
    return NextResponse.json({ error: 'roomId is required for an inpatient check-in' }, { status: 400 })
  }

  if (roomId) {
    const assigned = await assignRoomToPatient(roomId, patientId)
    if (!assigned) {
      return NextResponse.json({ error: 'That room is no longer available. Please choose another.' }, { status: 409 })
    }
  }

  const created = await createDoctorAssignment({
    patientId,
    providerId,
    visitType,
    urgency,
    reason,
    roomId: roomId ?? null,
    assignedByName: session.name,
  })

  await logAudit(session, `checked in patient (${visitType})`, patientId)
  return NextResponse.json(created, { status: 201 })
}

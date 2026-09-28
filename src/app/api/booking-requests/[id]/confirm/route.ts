import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getBookingRequestById, confirmBookingRequest } from '@/lib/queries/booking-requests'

const confirmBookingRequestSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.number().int().positive(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  visitReason: z.string().min(1),
}).strict()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['admin', 'crc', 'frontdesk'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const requestId = Number(id)
  if (!Number.isInteger(requestId)) return NextResponse.json({ error: 'Invalid booking request id' }, { status: 400 })

  const parsed = confirmBookingRequestSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid confirm payload', details: parsed.error.flatten() }, { status: 400 })

  const startsAt = new Date(parsed.data.startsAt)
  const endsAt = new Date(parsed.data.endsAt)
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt must be a valid time after startsAt' }, { status: 400 })
  }

  const existing = await getBookingRequestById(requestId)
  if (!existing) return NextResponse.json({ error: 'Booking request not found' }, { status: 404 })

  const result = await confirmBookingRequest(requestId, {
    patientId: parsed.data.patientId,
    providerId: parsed.data.providerId,
    startsAt,
    endsAt,
    visitReason: parsed.data.visitReason,
    reviewedByName: session.name,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  await logAudit(session, 'confirmed booking request', parsed.data.patientId)
  return NextResponse.json(result)
}

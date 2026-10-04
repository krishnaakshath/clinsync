import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appointments, doctorAssignments } from '@/db/schema'
import { hasSchedulingConflict } from '@/lib/queries/appointments'
import { scheduleAssignment, notifyPatientOfScheduledAssignment } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'

const scheduleSchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  visitReason: z.string().min(1),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'pi') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const assignmentId = Number(id)
  if (!Number.isInteger(assignmentId)) return NextResponse.json({ error: 'Invalid assignment id' }, { status: 400 })

  const parsed = scheduleSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid schedule payload', details: parsed.error.flatten() }, { status: 400 })

  const startsAt = new Date(parsed.data.startsAt)
  const endsAt = new Date(parsed.data.endsAt)
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt must be a valid time after startsAt' }, { status: 400 })
  }

  const db = getDb()
  const [assignmentRow] = await db.select().from(doctorAssignments).where(eq(doctorAssignments.id, assignmentId))
  if (!assignmentRow) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  // Ownership check: the same best-effort last-name match used in
  // doctor/page.tsx to resolve "this PI's own provider row", applied here to
  // make sure a PI can only schedule/decline assignments actually routed to
  // them -- there's no real session<->provider-row link yet.
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const providers = await listActiveProviders()
  const providerMatch = providers.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  if (!providerMatch || assignmentRow.providerId !== providerMatch.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const alreadyHandled = { error: 'This assignment has already been scheduled or declined.' }
  if (assignmentRow.status !== 'pending') {
    return NextResponse.json(alreadyHandled, { status: 409 })
  }

  if (await hasSchedulingConflict(assignmentRow.providerId, startsAt, endsAt)) {
    return NextResponse.json({ error: 'You already have an appointment during that time.' }, { status: 409 })
  }

  const [appointment] = await db.insert(appointments).values({
    patientId: assignmentRow.patientId,
    providerId: assignmentRow.providerId,
    startsAt,
    endsAt,
    visitReason: parsed.data.visitReason,
    status: 'scheduled',
  }).returning()

  const updated = await scheduleAssignment(assignmentId, appointment.id)
  if (!updated) {
    // A concurrent request scheduled (or someone declined) this assignment
    // between our status read and our update. Remove the appointment we just
    // inserted so it isn't orphaned, and send no message.
    await db.delete(appointments).where(eq(appointments.id, appointment.id))
    return NextResponse.json(alreadyHandled, { status: 409 })
  }
  try {
    await notifyPatientOfScheduledAssignment(updated, appointment, providerMatch.name)
  } catch (err) {
    // The appointment is already committed; only the patient message failed.
    console.error('Failed to notify patient of scheduled assignment', err)
    await logAudit(session, 'scheduled assignment into appointment; patient notification FAILED', assignmentRow.patientId)
    return NextResponse.json(
      { error: 'The appointment was scheduled, but the confirmation message to the patient could not be sent. Please message the patient manually.' },
      { status: 500 },
    )
  }
  await logAudit(session, 'scheduled assignment into appointment and notified patient', assignmentRow.patientId)
  // Re-read so the response reflects patientNotifiedAt set by the notify step.
  const [final] = await db.select().from(doctorAssignments).where(eq(doctorAssignments.id, assignmentId))
  return NextResponse.json(final ?? updated, { status: 200 })
}

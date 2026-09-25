import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appointments, doctorAssignments } from '@/db/schema'
import { hasSchedulingConflict } from '@/lib/queries/appointments'
import { scheduleAssignment } from '@/lib/queries/doctor-assignments'
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
  await logAudit(session, 'scheduled assignment into appointment', assignmentRow.patientId)
  return NextResponse.json(updated, { status: 200 })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDb } from '@/db/client'
import { doctorAssignments } from '@/db/schema'
import { declineAssignment } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'

const declineSchema = z.object({ reason: z.string().min(1) }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'pi') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const assignmentId = Number(id)
  if (!Number.isInteger(assignmentId)) return NextResponse.json({ error: 'Invalid assignment id' }, { status: 400 })

  const parsed = declineSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decline payload', details: parsed.error.flatten() }, { status: 400 })

  // Load the assignment row BEFORE mutating it, so ownership can be checked
  // and a 403 returned before declineAssignment ever touches the row --
  // same last-name-match convention as doctor/page.tsx and the schedule route.
  const [assignmentRow] = await getDb().select().from(doctorAssignments).where(eq(doctorAssignments.id, assignmentId))
  if (!assignmentRow) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const providers = await listActiveProviders()
  const providerMatch = providers.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  if (!providerMatch || assignmentRow.providerId !== providerMatch.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await declineAssignment(assignmentId, parsed.data.reason)
  if (!updated) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  await logAudit(session, 'declined assignment', updated.patientId)
  return NextResponse.json(updated, { status: 200 })
}

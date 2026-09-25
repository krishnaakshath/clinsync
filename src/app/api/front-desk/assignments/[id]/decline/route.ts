import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { declineAssignment } from '@/lib/queries/doctor-assignments'

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

  const updated = await declineAssignment(assignmentId, parsed.data.reason)
  if (!updated) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  await logAudit(session, 'declined assignment', updated.patientId)
  return NextResponse.json(updated, { status: 200 })
}

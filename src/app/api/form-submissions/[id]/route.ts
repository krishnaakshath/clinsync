import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { formSubmissions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormSubmission } from '@/lib/queries/form-submissions'
import { maybeAutoClassify } from '@/lib/auto-classify'

const updateSubmissionSchema = z.object({
  status: z.enum(['sent', 'partial', 'completed']),
  answers: z.record(z.string(), z.string()).optional(),
}).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params
  const submission = await getFormSubmission(Number(id))
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(submission)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params

  const parsed = updateSubmissionSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid submission update', details: parsed.error.flatten() }, { status: 400 })

  const existing = await getFormSubmission(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const completedDate = parsed.data.status === 'completed' ? new Date() : null
  await getDb().update(formSubmissions).set({ ...parsed.data, completedDate }).where(eq(formSubmissions.id, Number(id)))

  if (parsed.data.status === 'completed') {
    await logAudit(session, 'completed intake form', existing.patientId)
    await maybeAutoClassify(existing.patientId)
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { formSubmissions } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { getIntakePortalData, getSubmissionPatientIdByToken } from '@/lib/queries/intake-portal'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'
import { invalidateCache, patientDetailCacheKey } from '@/lib/cache'

// Deliberately NOT requireSession()-gated -- a referred patient has no staff
// account. Authorization here is possession of the unguessable token itself,
// checked inside getIntakePortalData/getSubmissionPatientIdByToken (expired
// or completed submissions refuse access regardless of who holds the link).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getIntakePortalData(token)
  return NextResponse.json(data)
}

const submitSchema = z.object({
  answers: z.record(z.string(), z.string()),
  complete: z.boolean(),
}).strict()

export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const patientId = await getSubmissionPatientIdByToken(token)
  if (!patientId) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const parsed = submitSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid submission', details: parsed.error.flatten() }, { status: 400 })

  const status = parsed.data.complete ? 'completed' : 'partial'
  const completedDate = parsed.data.complete ? new Date() : null
  // Re-check status !== 'completed' in the same statement as the write --
  // the earlier getSubmissionPatientIdByToken check and this update are two
  // separate round-trips, so a second, near-simultaneous PUT could otherwise
  // slip through between them and overwrite an already-completed submission.
  const updated = await getDb()
    .update(formSubmissions)
    .set({ answers: parsed.data.answers, status, completedDate })
    .where(and(eq(formSubmissions.accessToken, token), ne(formSubmissions.status, 'completed')))
    .returning({ id: formSubmissions.id })
  if (updated.length === 0) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  await invalidateCache(patientDetailCacheKey(patientId))
  await logPatientPortalAction(parsed.data.complete ? 'completed intake form via patient portal' : 'saved partial progress via patient portal', patientId)

  return NextResponse.json({ ok: true })
}

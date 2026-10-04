import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'

// Allowlists exactly the fields a trial's criteria configuration may update.
// `.strict()` rejects any other key outright (e.g. `id`, `createdAt`, or a
// column this route was never meant to touch) rather than silently ignoring
// it, so a caller gets a clear 400 instead of an unnoticed no-op.
const str = z.string().trim().min(1)

const criteriaUpdateSchema = z
  .object({
    diagnosisCodes: z.array(z.object({ code: str, description: str })).optional(),
    ratingScales: z.array(z.object({ name: str, description: str })).optional(),
    medicationClasses: z
      .array(z.object({ className: str, washoutDays: z.number().int().min(0), rule: str, ruleType: z.enum(['washout_exclusion', 'required_stable']) }))
      .optional(),
    exclusionDiagnoses: z.array(z.object({ code: str, description: str })).optional(),
    minRatingScaleScore: z.number().int().positive().nullable().optional(),
    ageMin: z.number().int().positive().optional(),
    ageMax: z.number().int().positive().optional(),
  })
  .strict()
  .refine((v) => v.ageMin === undefined || v.ageMax === undefined || v.ageMax >= v.ageMin, {
    message: 'ageMax must be greater than or equal to ageMin',
    path: ['ageMax'],
  })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  // Eligibility criteria define who can enroll in a trial, so changing them is
  // a protocol decision -- PI/admin only, not coordinators.
  if (session.role !== 'pi' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — PI or admin only' }, { status: 403 })
  }

  const { trialId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = criteriaUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid criteria payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const [existing] = await db.select({ ageMin: trials.ageMin, ageMax: trials.ageMax }).from(trials).where(eq(trials.id, trialId))
  if (!existing) return NextResponse.json({ error: 'Trial not found' }, { status: 404 })

  // When only one bound is sent, check it against the stored other bound.
  const nextMin = parsed.data.ageMin ?? existing.ageMin
  const nextMax = parsed.data.ageMax ?? existing.ageMax
  if (nextMax < nextMin) {
    return NextResponse.json({ error: 'ageMax must be greater than or equal to ageMin' }, { status: 400 })
  }

  // listAllTrials() is an uncached query, so no cache invalidation is needed.
  await db.update(trials).set(parsed.data).where(eq(trials.id, trialId))
  await logAudit(session, `updated criteria for trial ${trialId}`, null)
  return NextResponse.json({ ok: true })
}

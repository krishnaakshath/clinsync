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
const criteriaUpdateSchema = z
  .object({
    diagnosisCodes: z.array(z.object({ code: z.string(), description: z.string() })).optional(),
    ratingScales: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
    medicationClasses: z
      .array(z.object({ className: z.string(), washoutDays: z.number(), rule: z.string() }))
      .optional(),
    ageMin: z.number().int().positive().optional(),
    ageMax: z.number().int().positive().optional(),
  })
  .strict()

export async function PUT(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { trialId } = await params

  const parsed = criteriaUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid criteria payload', details: parsed.error.flatten() }, { status: 400 })
  }

  await getDb().update(trials).set(parsed.data).where(eq(trials.id, trialId))
  await logAudit(session, `updated criteria for trial ${trialId}`, null)
  return NextResponse.json({ ok: true })
}

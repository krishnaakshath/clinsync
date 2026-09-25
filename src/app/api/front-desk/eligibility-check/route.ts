import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { simulateEligibilityCheck, recordEligibilityCheck } from '@/lib/queries/insurance-eligibility'

const eligibilitySchema = z.object({
  patientId: z.string().min(1),
  payerName: z.string().min(1),
}).strict()

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['frontdesk', 'admin', 'crc'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = eligibilitySchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid eligibility-check payload', details: parsed.error.flatten() }, { status: 400 })

  const { patientId, payerName } = parsed.data
  const { status, copayCents } = simulateEligibilityCheck(patientId, payerName)
  const created = await recordEligibilityCheck({ patientId, payerName, status, copayCents, checkedByName: session.name })

  await logAudit(session, `verified insurance eligibility (${status})`, patientId)
  return NextResponse.json(created, { status: 201 })
}

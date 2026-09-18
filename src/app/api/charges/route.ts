import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listCharges, createCharge } from '@/lib/queries/charges'

const createChargeSchema = z.object({
  patientId: z.string().min(1),
  providerName: z.string().min(1),
  dateOfService: z.string().min(1),
  diagnosisCodes: z.array(z.object({ code: z.string().min(1), description: z.string().min(1) })).min(1),
  procedureCodes: z.array(z.object({
    code: z.string().min(1), description: z.string().min(1), units: z.number().int().positive(), chargeCents: z.number().int().positive(),
  })).min(1),
  amountCents: z.number().int().positive(),
  notes: z.string().optional(),
}).strict()

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  return NextResponse.json(await listCharges())
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = createChargeSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid charge payload', details: parsed.error.flatten() }, { status: 400 })

  const created = await createCharge(parsed.data)
  await logAudit(session, 'created charge', parsed.data.patientId)
  return NextResponse.json(created, { status: 201 })
}

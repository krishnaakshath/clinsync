import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getCharge, updateChargeStatus, isAllowedChargeTransition, type ChargeStatus } from '@/lib/queries/charges'

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'pending_approval', 'approved', 'submitted']),
}).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params
  const charge = await getCharge(Number(id))
  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(charge)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params

  const parsed = statusUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status payload', details: parsed.error.flatten() }, { status: 400 })

  const existing = await getCharge(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const nextStatus = parsed.data.status as ChargeStatus
  if (!isAllowedChargeTransition(existing.status, nextStatus)) {
    return NextResponse.json({ error: `Cannot move a charge from '${existing.status}' to '${nextStatus}'` }, { status: 400 })
  }

  await updateChargeStatus(Number(id), nextStatus)
  await logAudit(session, `updated charge ${id} status to ${nextStatus}`, existing.patientId)
  return NextResponse.json({ ok: true })
}

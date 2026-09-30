import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { markCollected } from '@/lib/queries/lab-orders'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  // Asymmetric role gate vs. order/result/cancel: marking a sample
  // collected is a logistics step, not a clinical judgment, so `frontdesk`
  // is allowed here (spec §8) but not on the other three write routes.
  if (!['admin', 'pi', 'frontdesk', 'labs'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId)) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })

  const result = await markCollected(orderId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  await logAudit(session, 'marked lab order collected', result.patientId)
  return NextResponse.json({ ok: true })
}

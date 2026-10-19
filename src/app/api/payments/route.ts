import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { listPayments } from '@/lib/queries/payments'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await listPayments())
}

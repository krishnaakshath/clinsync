import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { getBroadcast } from '@/lib/queries/broadcasts'
import { parseIntParam } from '@/lib/http'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const broadcastId = parseIntParam(id)
  if (broadcastId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const broadcast = await getBroadcast(broadcastId)
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(broadcast)
}

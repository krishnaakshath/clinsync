import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getStaffMemberDetail } from '@/lib/queries/staff-members'

const READ_ROLES = ['admin', 'pi', 'crc', 'frontdesk']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!READ_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const staffId = Number(id)
  if (!Number.isInteger(staffId)) return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 })

  const detail = await getStaffMemberDetail(staffId)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'viewed staff member detail', null)
  return NextResponse.json(detail)
}

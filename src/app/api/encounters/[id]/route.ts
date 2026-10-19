import { NextRequest, NextResponse } from 'next/server'
import { parseIntParam } from '@/lib/http'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getEncounter } from '@/lib/queries/encounters'

// Session-only gate -- same reasoning as GET/POST /api/encounters: clinical
// data, visible to every staff role including PI.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const encounterId = parseIntParam(id)
  if (encounterId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const encounter = await getEncounter(encounterId)
  if (!encounter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, `viewed encounter ${id}`, encounter.patientId)
  return NextResponse.json(encounter)
}

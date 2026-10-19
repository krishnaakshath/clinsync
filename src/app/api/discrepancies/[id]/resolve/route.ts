import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { formChartDiscrepancies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { canSendForms } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { resolveDiscrepancy } from '@/lib/queries/discrepancies'
import { invalidateCache, patientDetailCacheKey } from '@/lib/cache'
import { parseIntParam } from '@/lib/http'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canSendForms(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const discrepancyId = parseIntParam(id)
  if (discrepancyId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const [existing] = await getDb().select().from(formChartDiscrepancies).where(eq(formChartDiscrepancies.id, discrepancyId))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await resolveDiscrepancy(discrepancyId, session.name)
  await invalidateCache(patientDetailCacheKey(existing.patientId))
  await logAudit(session, `resolved form-vs-chart discrepancy: ${existing.questionLabel}`, existing.patientId)

  return NextResponse.json({ ok: true })
}

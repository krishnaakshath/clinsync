import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients, patientTrialScreenings, screeningCriteriaResults } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { evaluateCriteria } from '@/lib/rule-engine'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { invalidateCache, patientDetailCacheKey, patientListCacheKey } from '@/lib/cache'

// Re-runs the rule engine against currently stored evidence and updates
// `chartDataAsOf`. In Plan B this also re-fetches from the real
// IntakeQ/Tebra connectors before re-evaluating.
export async function POST(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { anonId } = await params
  const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  if (!screening) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const criteria = await getDb().select().from(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screening.id))
  const overallStatus = evaluateCriteria(criteria)
  await getDb().update(patientTrialScreenings).set({ overallStatus }).where(eq(patientTrialScreenings.id, screening.id))
  await getDb().update(patients).set({ chartDataAsOf: new Date() }).where(eq(patients.id, anonId))

  await invalidateCache(patientDetailCacheKey(anonId))
  await invalidateCache(patientListCacheKey(screening.trialId))
  await invalidateCache(patientListCacheKey(null))

  await logAudit(session, 'refreshed patient from source systems', anonId)

  return NextResponse.json({ overallStatus })
}

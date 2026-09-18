import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients, patientTrialScreenings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { regenerateScreeningCriteria } from '@/lib/queries/eligibility'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { invalidateCache, patientDetailCacheKey, patientListCacheKey } from '@/lib/cache'

// Re-runs the real inclusion/exclusion rule engine (lib/eligibility.ts)
// against the patient's current chart data and updates `chartDataAsOf`. In
// Plan B this also re-fetches from the real IntakeQ/Tebra connectors before
// re-evaluating.
export async function POST(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { anonId } = await params
  const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  if (!screening) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const overallStatus = await regenerateScreeningCriteria(anonId, screening.id, screening.trialId)
  await getDb().update(patients).set({ chartDataAsOf: new Date() }).where(eq(patients.id, anonId))

  await invalidateCache(patientDetailCacheKey(anonId))
  await invalidateCache(patientListCacheKey(screening.trialId))
  await invalidateCache(patientListCacheKey(null))

  await logAudit(session, 'refreshed patient from source systems', anonId)

  return NextResponse.json({ overallStatus })
}

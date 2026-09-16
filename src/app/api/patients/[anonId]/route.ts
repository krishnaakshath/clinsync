import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { getSession } from '@/lib/auth'
import { getOrSetCache, patientDetailCacheKey } from '@/lib/cache'

export async function GET(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { anonId } = await params

  const detail = await getOrSetCache(patientDetailCacheKey(anonId), 30, async () => {
    const [patient] = await getDb().select().from(patients).where(eq(patients.id, anonId))
    if (!patient) return null

    const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
    const criteria = screening ? await getDb().select().from(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screening.id)) : []
    const dx = await getDb().select().from(diagnoses).where(eq(diagnoses.patientId, anonId))
    const meds = await getDb().select().from(medicationEpisodes).where(eq(medicationEpisodes.patientId, anonId))

    return { ...patient, overallStatus: screening?.overallStatus, criteria, diagnoses: dx, medications: meds }
  })

  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'viewed patient detail', anonId)

  return NextResponse.json(detail)
}

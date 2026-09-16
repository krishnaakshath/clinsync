import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients, patientTrialScreenings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { getOrSetCache, patientListCacheKey } from '@/lib/cache'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const trialId = request.nextUrl.searchParams.get('trialId')

  const patientsWithStatus = await getOrSetCache(patientListCacheKey(trialId), 30, async () => {
    const rows = await getDb()
      .select({ patient: patients, screening: patientTrialScreenings })
      .from(patients)
      .leftJoin(patientTrialScreenings, eq(patientTrialScreenings.patientId, patients.id))
      .where(trialId ? eq(patientTrialScreenings.trialId, trialId) : undefined)

    return rows.map((r) => ({ ...r.patient, trialId: r.screening?.trialId, overallStatus: r.screening?.overallStatus }))
  })

  await logAudit(session, 'viewed patient list', null)

  return NextResponse.json({ patients: patientsWithStatus })
}

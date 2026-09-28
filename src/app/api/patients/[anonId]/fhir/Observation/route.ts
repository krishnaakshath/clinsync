import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { gatherPatientFhirData } from '@/lib/fhir/gather'
import { observationsToFhir } from '@/lib/fhir/observation'
import { buildBundle } from '@/lib/fhir/bundle'

export async function GET(_request: Request, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['admin', 'pi', 'crc', 'frontdesk'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { anonId } = await params
  const data = await gatherPatientFhirData(anonId)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await logAudit(session, 'exported FHIR Observation bundle', anonId)
  return NextResponse.json(buildBundle(observationsToFhir(data.patient.id, data.labOrderRows)))
}

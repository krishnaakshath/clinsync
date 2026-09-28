import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getSessionById } from '@/lib/queries/telemedicine-sessions'
import { TelemedicineCallScreen } from '@/components/TelemedicineCallScreen'

export default async function TelemedicineCallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  // Must be the first statement -- see src/lib/auth.ts's comment on
  // requireSessionOrRedirect for why this can't be skipped.
  const session = await requireSessionOrRedirect()

  const { sessionId } = await params
  const id = Number(sessionId)
  if (!Number.isInteger(id)) notFound()

  const telemedicineSession = await getSessionById(id)
  if (!telemedicineSession) notFound()

  await logAudit(session, 'joined telemedicine call as provider', telemedicineSession.appointmentPatientId)

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Video visit</h1>
      <TelemedicineCallScreen
        role="provider"
        pollUrl={`/api/telemedicine/${telemedicineSession.id}/signal`}
        initialStatus={telemedicineSession.status}
      />
    </div>
  )
}

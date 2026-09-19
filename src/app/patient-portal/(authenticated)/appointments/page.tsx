import { notFound } from 'next/navigation'
import { requirePatientSessionOrRedirect } from '@/lib/patient-session'
import { getPatientPortalData } from '@/lib/queries/patient-portal'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm'
const HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function PatientPortalAppointmentsPage() {
  const session = await requirePatientSessionOrRedirect()
  const data = await getPatientPortalData(session.patientId)
  if (!data) notFound()

  await logPatientPortalAction('viewed patient portal appointments', session.patientId)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Appointments</h1>

      <section className={SECTION}>
        <h2 className={HEADING}>Upcoming appointments</h2>
        {data.upcomingAppointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.upcomingAppointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <span>{a.visitReason} with {a.providerName}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>Past visits</h2>
        {data.pastAppointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past visits on file.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.pastAppointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <span>{a.visitReason} with {a.providerName}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.startsAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

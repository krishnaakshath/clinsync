import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { requirePatientSessionOrRedirect } from '@/lib/patient-session'
import { getPatientPortalData } from '@/lib/queries/patient-portal'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'
import { PatientPortalSignOutButton } from '@/components/PatientPortalSignOutButton'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm'
const HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function PatientPortalPage() {
  const session = await requirePatientSessionOrRedirect()
  const data = await getPatientPortalData(session.patientId)
  if (!data) notFound()

  await logPatientPortalAction('viewed patient portal home', session.patientId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome, {data.name}</h1>
          <p className="text-sm text-muted-foreground">DOB {data.dob} · Patient ID {data.id}</p>
        </div>
        <PatientPortalSignOutButton />
      </div>

      <section className={SECTION}>
        <h2 className={HEADING}>Your care team</h2>
        <p className="text-sm text-foreground">{data.currentProvider ?? 'Not yet assigned'}</p>
      </section>

      <section className={SECTION}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={HEADING}>Current medications</h2>
          <a href="/api/patient-portal/medications-export" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download summary
          </a>
        </div>
        {data.activeMedications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current medications on file.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.activeMedications.map((m) => (
              <li key={m.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-medium">{m.name}</span> ({m.medicationClass}) — {m.dose ?? 'dose not on file'}
                <span className="block text-xs text-muted-foreground">Started {m.startDate}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>Past medications</h2>
        {data.pastMedications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past medications on file.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.pastMedications.map((m) => (
              <li key={m.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-medium">{m.name}</span> ({m.medicationClass}) — {m.dose ?? 'dose not on file'}
                <span className="block text-xs text-muted-foreground">{m.startDate} to {m.stopDate ?? 'unknown'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>Diagnoses on file</h2>
        {data.diagnoses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No diagnoses on file.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground">
            {data.diagnoses.map((d, i) => <li key={i}>{d.code} — {d.description}</li>)}
          </ul>
        )}
      </section>

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

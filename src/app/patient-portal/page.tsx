import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Download, Pill, Stethoscope, CalendarCheck, FileText, ArrowRight } from 'lucide-react'
import { requirePatientSessionOrRedirect } from '@/lib/patient-session'
import { getPatientPortalData } from '@/lib/queries/patient-portal'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'
import { PatientPortalSignOutButton } from '@/components/PatientPortalSignOutButton'
import { PatientAvatar } from '@/components/PatientAvatar'
import { Tabs } from '@/components/Tabs'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm'
const HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

const TILE_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  sky: 'bg-sky-500/10 text-sky-700',
  emerald: 'bg-emerald-500/10 text-emerald-700',
  amber: 'bg-amber-500/10 text-amber-700',
}

const FORM_STATUS_STYLE: Record<string, string> = {
  sent: 'bg-amber-500/10 text-amber-700',
  partial: 'bg-sky-500/10 text-sky-700',
  completed: 'bg-emerald-500/10 text-emerald-700',
}

const FORM_STATUS_LABEL: Record<string, string> = {
  sent: 'Needs your response',
  partial: 'In progress',
  completed: 'Completed',
}

function SummaryTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string; color: keyof typeof TILE_COLOR }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TILE_COLOR[color]}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default async function PatientPortalPage() {
  const session = await requirePatientSessionOrRedirect()
  const data = await getPatientPortalData(session.patientId)
  if (!data) notFound()

  await logPatientPortalAction('viewed patient portal home', session.patientId)

  const overviewTab = (
    <div className="space-y-6">
      <section className={SECTION}>
        <h2 className={HEADING}>Your care team</h2>
        <p className="text-sm text-foreground">{data.currentProvider ?? 'Not yet assigned'}</p>
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
    </div>
  )

  const medicationsTab = (
    <div className="space-y-6">
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
    </div>
  )

  const formsTab = (
    <div className="space-y-6">
      <section className={SECTION}>
        <h2 className={HEADING}>Your forms</h2>
        {data.forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No forms have been sent to you yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.templateName}</p>
                  <p className="text-xs text-muted-foreground">Sent {new Date(f.sentDate).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FORM_STATUS_STYLE[f.status]}`}>{FORM_STATUS_LABEL[f.status]}</span>
                  {f.status !== 'completed' && f.accessToken && (
                    <Link href={`/intake/${f.accessToken}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {f.status === 'sent' ? 'Start' : 'Continue'}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  const appointmentsTab = (
    <div className="space-y-6">
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <PatientAvatar name={data.name} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Welcome, {data.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">DOB {data.dob} · Patient ID {data.id}</p>
          </div>
        </div>
        <PatientPortalSignOutButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon={Stethoscope} value={data.currentProvider ?? 'Unassigned'} label="Care team" color="primary" />
        <SummaryTile icon={Pill} value={data.activeMedications.length} label="Current meds" color="sky" />
        <SummaryTile icon={FileText} value={data.forms.filter((f) => f.status !== 'completed').length} label="Forms to complete" color="amber" />
        <SummaryTile icon={CalendarCheck} value={data.upcomingAppointments.length} label="Upcoming visits" color="emerald" />
      </div>

      <Tabs tabs={[
        { id: 'overview', label: 'Overview', content: overviewTab },
        { id: 'forms', label: <><FileText className="h-4 w-4" aria-hidden="true" />Forms</>, content: formsTab },
        { id: 'medications', label: <><Pill className="h-4 w-4" aria-hidden="true" />Medications</>, content: medicationsTab },
        { id: 'appointments', label: <><CalendarCheck className="h-4 w-4" aria-hidden="true" />Appointments</>, content: appointmentsTab },
      ]} />
    </div>
  )
}

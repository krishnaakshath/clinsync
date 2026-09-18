import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listFormTemplates } from '@/lib/queries/form-templates'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listUpcomingAppointments } from '@/lib/queries/appointments'
import { DashboardHomeClient } from '@/components/DashboardHomeClient'
import { AppointmentStatusChip } from '@/components/AppointmentStatusChip'

const EVENT_DOT: Record<string, string> = {
  'sent intake form': 'bg-sky-600',
  'completed intake form': 'bg-emerald-600',
  'verified identity': 'bg-primary',
  'ran classification': 'bg-accent',
}

const CARD_SURFACE = 'rounded-xl border border-primary/10 bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-5 backdrop-blur-sm transition-colors duration-200 hover:bg-primary/10">
      <p className="text-3xl font-bold tabular-nums text-primary">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
  )
}

export default async function DashboardHomePage() {
  const session = await requireSessionOrRedirect()
  const [data, templates, patients, upcomingAppointments] = await Promise.all([getDashboardData(), listFormTemplates(), listPatientsWithStatus(null), listUpcomingAppointments(5)])
  await logAudit(session, 'viewed home dashboard', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Home</h1>
      <DashboardHomeClient templates={templates.map((t) => ({ id: t.id, name: t.name }))} patients={patients.map((p) => ({ id: p.id, nameTebra: p.nameTebra, nameIntakeq: p.nameIntakeq }))} />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatTile value={patients.length} label="Total Patients" />
        <StatTile value={data.pendingFormsTotal} label="Pending Forms" />
        <StatTile value={data.pendingClassification.length} label="Pending Classifications" />
        <StatTile value={templates.length} label="Form Templates" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Latest Forms Received</SectionHeading>
          {data.latestForms.length === 0 ? <p className="text-sm text-muted-foreground">No records found.</p> : (
            <ul className="space-y-2">
              {data.latestForms.map((f) => (
                <li key={f.id} className="text-sm">
                  <Link href={`/client-forms/${f.id}`} className="font-medium text-primary hover:underline">{f.patientName}</Link>
                  <span className="text-muted-foreground"> — {f.templateName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Pending Forms</SectionHeading>
          {data.pendingForms.length === 0 ? <p className="text-sm text-muted-foreground">No records found.</p> : (
            <ul className="space-y-2">
              {data.pendingForms.map((f) => (
                <li key={f.id} className="text-sm">
                  <Link href={`/client-forms/${f.id}`} className="font-medium text-primary hover:underline">{f.patientName}</Link>
                  <span className="text-muted-foreground"> — {f.templateName} ({f.status})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Pending Classifications</SectionHeading>
          {data.pendingClassification.length === 0 ? <p className="text-sm text-muted-foreground">No records found.</p> : (
            <ul className="space-y-2">
              {data.pendingClassification.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link href={`/patients/${p.id}`} className="font-medium text-primary hover:underline">{p.nameTebra ?? p.nameIntakeq}</Link>
                  <span className="text-muted-foreground"> — intake complete, not yet classified</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Latest Account Events</SectionHeading>
          {data.recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">No records found.</p> : (
            <ul className="space-y-2">
              {data.recentEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${EVENT_DOT[e.action] ?? 'bg-muted-foreground'}`} aria-hidden="true" />
                  <span className="text-foreground">{e.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Appointments</h2>
            <Link href="/calendar" className="text-xs font-medium text-primary hover:underline">View Calendar</Link>
          </div>
          {upcomingAppointments.length === 0 ? <p className="text-sm text-muted-foreground">No appointments to show.</p> : (
            <ul className="space-y-2">
              {upcomingAppointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <div>
                    <Link href={`/patients/${a.patientId}`} className="font-medium text-primary hover:underline">{a.patientName}</Link>
                    <span className="text-muted-foreground"> — {a.visitReason} with {a.providerName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{new Date(a.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <AppointmentStatusChip status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

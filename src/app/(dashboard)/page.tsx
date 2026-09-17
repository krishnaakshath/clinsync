import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listFormTemplates } from '@/lib/queries/form-templates'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { DashboardHomeClient } from '@/components/DashboardHomeClient'

const EVENT_DOT: Record<string, string> = {
  'sent intake form': 'bg-sky-600',
  'completed intake form': 'bg-emerald-600',
  'verified identity': 'bg-primary',
  'ran classification': 'bg-accent',
}

export default async function DashboardHomePage() {
  const session = await requireSessionOrRedirect()
  const [data, templates, patients] = await Promise.all([getDashboardData(), listFormTemplates(), listPatientsWithStatus(null)])
  await logAudit(session, 'viewed home dashboard', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Home</h1>
      <DashboardHomeClient templates={templates.map((t) => ({ id: t.id, name: t.name }))} patients={patients.map((p) => ({ id: p.id, nameTebra: p.nameTebra, nameIntakeq: p.nameIntakeq }))} />

      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest Forms Received</h2>
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

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Forms</h2>
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

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Classifications</h2>
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

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest Account Events</h2>
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
      </div>
    </div>
  )
}

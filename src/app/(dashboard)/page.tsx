import Link from 'next/link'
import { FileClock, ClipboardCheck, LayoutTemplate, Clock, Users, Star } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listFormTemplates } from '@/lib/queries/form-templates'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAppointmentsInRange } from '@/lib/queries/appointments'
import { DashboardHomeClient } from '@/components/DashboardHomeClient'
import { DashboardAppointmentsTable } from '@/components/DashboardAppointmentsTable'
import { PatientsByMonthChart } from '@/components/PatientsByMonthChart'
import { ScreeningBreakdownChart } from '@/components/ScreeningBreakdownChart'

const EVENT_DOT: Record<string, string> = {
  'sent intake form': 'bg-sky-600',
  'completed intake form': 'bg-emerald-600',
  'verified identity': 'bg-primary',
  'ran classification': 'bg-accent',
}

const CARD_SURFACE = 'rounded-xl border border-primary/10 bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'

const STAT_ICON_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/10 text-accent',
  sky: 'bg-sky-500/10 text-sky-700',
  emerald: 'bg-emerald-500/10 text-emerald-700',
}

function MiniStatTile({ value, label, href, icon: Icon, color }: { value: number; label: string; href: string; icon: React.ComponentType<{ className?: string }>; color: keyof typeof STAT_ICON_COLOR }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4 backdrop-blur-sm transition-colors duration-200 hover:bg-primary/10">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STAT_ICON_COLOR[color]}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-xl font-bold tabular-nums text-primary">{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </Link>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
  )
}

export default async function DashboardHomePage() {
  const session = await requireSessionOrRedirect()

  const now = new Date()
  const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [data, templates, patients, appointmentsInRange] = await Promise.all([
    getDashboardData(),
    listFormTemplates(),
    listPatientsWithStatus(null),
    listAppointmentsInRange(rangeStart, rangeEnd),
  ])
  await logAudit(session, 'viewed home dashboard', null)

  const screenedCount = data.screeningBreakdown.green + data.screeningBreakdown.yellow + data.screeningBreakdown.red
  const unscreenedCount = Math.max(patients.length - screenedCount, 0)
  const screenedPct = patients.length > 0 ? Math.round((screenedCount / patients.length) * 100) : 0
  const currentMonthLabel = data.patientsByMonth[now.getMonth()]?.month

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hello, {session.name}!</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening across the pre-screening workbook today.</p>
        </div>
        <DashboardHomeClient templates={templates.map((t) => ({ id: t.id, name: t.name }))} patients={patients.map((p) => ({ id: p.id, nameTebra: p.nameTebra, nameIntakeq: p.nameIntakeq }))} />
      </div>

      {/* Reference-inspired stat row: a text stat with a trend affordance, a
          headline count with a two-color split bar, and a rating stat --
          all sourced from real appointment/patient/review data. */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`${CARD_SURFACE} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peak Scheduling Hours</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700" aria-hidden="true">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{data.peakHourRange ?? 'Not enough data yet'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Busiest 2-hour window across scheduled appointments</p>
        </div>

        <div className={`${CARD_SURFACE} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Patients</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">{patients.length}</p>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${screenedPct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{screenedCount} screened · {unscreenedCount} not yet screened</p>
        </div>

        <div className={`${CARD_SURFACE} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg. Patient Experience</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700" aria-hidden="true">
              <Star className="h-4 w-4" />
            </span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">{data.avgExperienceRating !== null ? data.avgExperienceRating.toFixed(1) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.completedReviewCount} completed experience survey{data.completedReviewCount === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className={`${CARD_SURFACE} p-5 lg:col-span-3`}>
          <SectionHeading>Patients Added ({now.getFullYear()})</SectionHeading>
          <PatientsByMonthChart data={data.patientsByMonth} highlightMonth={currentMonthLabel} />
        </section>
        <section className={`${CARD_SURFACE} p-5 lg:col-span-2`}>
          <SectionHeading>Screening Status Breakdown</SectionHeading>
          <ScreeningBreakdownChart breakdown={data.screeningBreakdown} />
        </section>
      </div>

      <section className={`${CARD_SURFACE} mb-6 p-5`}>
        <DashboardAppointmentsTable appointments={appointmentsInRange.map((a) => ({
          id: a.id,
          patientId: a.patientId,
          patientName: a.patientName,
          providerName: a.providerName,
          visitReason: a.visitReason,
          status: a.status,
          startsAt: a.startsAt.toString(),
        }))} />
      </section>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStatTile value={data.pendingFormsTotal} label="Pending Forms" href="/client-forms" icon={FileClock} color="sky" />
        <MiniStatTile value={data.pendingClassification.length} label="Pending Classifications" href="/patients" icon={ClipboardCheck} color="accent" />
        <MiniStatTile value={templates.length} label="Form Templates" href="/forms" icon={LayoutTemplate} color="emerald" />
        <MiniStatTile value={patients.length} label="Total Patients" href="/patients" icon={Users} color="primary" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <div className="mb-3 flex items-center justify-between">
            <SectionHeading>Latest Account Events</SectionHeading>
          </div>
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

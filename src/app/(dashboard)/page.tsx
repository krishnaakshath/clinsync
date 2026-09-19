import Link from 'next/link'
import { FileClock, ClipboardCheck, LayoutTemplate, Clock, Users, Star, Send, CheckCircle2, Fingerprint, Sparkles, ArrowRight } from 'lucide-react'
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
import { PatientAvatar } from '@/components/PatientAvatar'

const FORM_STATUS_STYLE: Record<string, string> = {
  sent: 'bg-amber-500/10 text-amber-700',
  partial: 'bg-sky-500/10 text-sky-700',
  completed: 'bg-emerald-500/10 text-emerald-700',
}

const EVENT_ICON: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  'sent intake form': { icon: Send, color: 'bg-sky-500/10 text-sky-700' },
  'completed intake form': { icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-700' },
  'verified identity': { icon: Fingerprint, color: 'bg-primary/10 text-primary' },
  'ran classification': { icon: Sparkles, color: 'bg-accent/10 text-accent' },
}
const EVENT_ICON_FALLBACK = { icon: Clock, color: 'bg-muted text-muted-foreground' }

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
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
          {data.latestForms.length === 0 ? <EmptyRow text="No forms received yet." /> : (
            <ul className="divide-y divide-border">
              {data.latestForms.map((f) => (
                <li key={f.id}>
                  <Link href={`/client-forms/${f.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40 -mx-2 px-2 rounded-lg">
                    <PatientAvatar name={f.patientName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.patientName}</p>
                      <p className="truncate text-xs text-muted-foreground">{f.templateName}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Pending Forms</SectionHeading>
          {data.pendingForms.length === 0 ? <EmptyRow text="No pending forms." /> : (
            <ul className="divide-y divide-border">
              {data.pendingForms.map((f) => (
                <li key={f.id}>
                  <Link href={`/client-forms/${f.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40 -mx-2 px-2 rounded-lg">
                    <PatientAvatar name={f.patientName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.patientName}</p>
                      <p className="truncate text-xs text-muted-foreground">{f.templateName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${FORM_STATUS_STYLE[f.status] ?? 'bg-muted text-muted-foreground'}`}>{f.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Pending Classifications</SectionHeading>
          {data.pendingClassification.length === 0 ? <EmptyRow text="Everything's been classified." /> : (
            <ul className="divide-y divide-border">
              {data.pendingClassification.map((p) => {
                const name = p.nameTebra ?? p.nameIntakeq
                return (
                  <li key={p.id}>
                    <Link href={`/patients/${p.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40 -mx-2 px-2 rounded-lg">
                      <PatientAvatar name={name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">Intake complete, awaiting classification</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={`${CARD_SURFACE} p-5`}>
          <SectionHeading>Latest Account Events</SectionHeading>
          {data.recentEvents.length === 0 ? <EmptyRow text="No recent activity." /> : (
            <ul className="divide-y divide-border">
              {data.recentEvents.map((e) => {
                const { icon: Icon, color } = EVENT_ICON[e.action] ?? EVENT_ICON_FALLBACK
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`} aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{e.action}</p>
                      <p className="text-xs text-muted-foreground">{e.userName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

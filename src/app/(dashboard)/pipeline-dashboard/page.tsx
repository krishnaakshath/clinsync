import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPipelinePerformance } from '@/lib/queries/pipeline-dashboard'

const PRESETS = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last30', label: 'Last 30 Days' },
] as const

function resolveRange(preset: string | undefined, from: string | undefined, to: string | undefined) {
  const now = new Date()
  if (preset === 'custom' && from && to) {
    return { from: new Date(from), to: new Date(to), preset: 'custom' as const }
  }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now, preset: 'week' as const }
  }
  if (preset === 'last30') {
    const start = new Date(now)
    start.setDate(now.getDate() - 30)
    return { from: start, to: now, preset: 'last30' as const }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: start, to: now, preset: 'month' as const }
}

export default async function PipelineDashboardPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const session = await requireSessionOrRedirect()
  const sp = await searchParams
  const range = resolveRange(sp.preset, sp.from, sp.to)
  const performance = await getPipelinePerformance({ from: range.from, to: range.to })
  await logAudit(session, 'viewed pipeline performance dashboard', null)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pipeline Performance</h1>
        <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/pipeline-dashboard?preset=${p.key}`} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${range.preset === p.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{p.label}</Link>
          ))}
        </div>
      </div>

      <form className="mb-6 flex items-end gap-3 text-sm" action="/pipeline-dashboard">
        <input type="hidden" name="preset" value="custom" />
        <div>
          <label htmlFor="pipeline-from" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</label>
          <input id="pipeline-from" type="date" name="from" defaultValue={range.from.toISOString().slice(0, 10)} className="rounded-md border border-border px-3 py-2" />
        </div>
        <div>
          <label htmlFor="pipeline-to" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</label>
          <input id="pipeline-to" type="date" name="to" defaultValue={range.to.toISOString().slice(0, 10)} className="rounded-md border border-border px-3 py-2" />
        </div>
        <button type="submit" className="rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-secondary">Update</button>
      </form>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referrals Received</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{performance.referralsReceived}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forms Completed</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{performance.formsCompleted}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patients Classified</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{performance.patientsClassified}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg. Days Referral → Classification</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{performance.avgDaysToClassify !== null ? performance.avgDaysToClassify.toFixed(1) : '—'}</p>
        </div>
      </div>
    </div>
  )
}

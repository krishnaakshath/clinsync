import { requireSessionOrRedirect } from '@/lib/auth'
import { BUILD_PHASES, buildStatusTotals, type PhaseStatus } from '@/lib/build-status'

const PILL_STYLE: Record<PhaseStatus, string> = {
  merged: 'bg-primary/10 text-primary',
  progress: 'bg-warning/15 text-warning',
  blocked: 'bg-muted text-muted-foreground',
}
const PILL_LABEL: Record<PhaseStatus, string> = {
  merged: 'Merged',
  progress: 'In progress',
  blocked: 'Queued',
}

export default async function BuildStatusPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  await requireSessionOrRedirect()
  const totals = buildStatusTotals()

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Build Progress</h1>
      <p className="mb-6 text-sm text-muted-foreground">Live task-by-task status across every build phase. Refresh this page any time to see the latest.</p>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-2xl font-bold tabular-nums text-primary">{totals.done}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasks Done</p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-2xl font-bold tabular-nums text-primary">{totals.total}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Tasks</p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-2xl font-bold tabular-nums text-primary">{totals.active}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phases Active</p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-2xl font-bold tabular-nums text-primary">{totals.merged}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merged</p>
        </div>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${totals.percent}%` }} />
      </div>

      <div className="space-y-3">
        {BUILD_PHASES.map((p) => {
          const pct = Math.round((p.done / p.total) * 100)
          return (
            <div key={p.name} className={`rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm ${p.status === 'blocked' ? 'opacity-70' : ''}`}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground">{p.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${PILL_STYLE[p.status]}`}>{PILL_LABEL[p.status]}</span>
              </div>
              <p className="mb-2 text-xs tabular-nums text-muted-foreground">{p.done} of {p.total} tasks{p.note ? ` — ${p.note}` : ''}</p>
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${p.status === 'blocked' ? 'bg-muted-foreground' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: p.total }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold tabular-nums ${
                      i < p.done
                        ? 'bg-primary text-primary-foreground'
                        : i === p.done && p.status === 'progress'
                          ? 'border border-warning bg-warning/15 text-warning'
                          : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        Each square is one task from that phase's implementation plan. A phase runs in its own isolated git worktree with a fresh implementer and reviewer per task; nothing here is pushed to a remote until you say so. Phases 4 and 6 are queued behind the others by design.
      </p>
    </div>
  )
}

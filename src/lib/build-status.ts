// Hand-updated snapshot of build progress across every phase's implementation
// plan. This is an internal build-monitoring page for the product owner, not
// a feature CRCs/PIs use -- updated here each time a task lands or a phase
// merges. Not derived from git automatically since task-level SDD review
// state (approved / needs-fixes / merged) isn't something git tracks.

export type PhaseStatus = 'merged' | 'progress' | 'blocked'

export interface Phase {
  name: string
  total: number
  done: number
  status: PhaseStatus
  note?: string
}

export const BUILD_PHASES: Phase[] = [
  { name: 'Phase 1 — Core Workbook', total: 11, done: 11, status: 'merged', note: 'Live in this app right now.' },
  { name: 'Phase 2 — Scheduling', total: 8, done: 5, status: 'progress', note: 'Calendar, providers, appointments, New Event modal.' },
  { name: 'Phase 3 — Billing', total: 13, done: 4, status: 'progress', note: 'Charges, insurance claims, mock-only payments.' },
  { name: 'Patient Intake Portal', total: 6, done: 6, status: 'merged', note: 'Live — try /intake/<token> after sending a form.' },
  { name: 'Phase 5 — Engagement', total: 9, done: 3, status: 'progress', note: 'Broadcasts (simulated delivery), patient reviews.' },
  { name: 'Phase 4 — Reports & Documents', total: 14, done: 0, status: 'blocked', note: 'Queued behind Phase 2/3 schema settling.' },
  { name: 'Phase 6 — Practice Settings', total: 6, done: 0, status: 'blocked', note: 'Runs last by design.' },
]

export function buildStatusTotals() {
  const done = BUILD_PHASES.reduce((s, p) => s + p.done, 0)
  const total = BUILD_PHASES.reduce((s, p) => s + p.total, 0)
  const merged = BUILD_PHASES.filter((p) => p.status === 'merged').length
  const active = BUILD_PHASES.filter((p) => p.status !== 'blocked').length
  return { done, total, merged, active, percent: Math.round((done / total) * 100) }
}

import { redirect } from 'next/navigation'
import { Users, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { resolveSessionProvider } from '@/lib/provider-identity'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listActiveProviders } from '@/lib/queries/providers'
import { listPendingAssignmentsForProvider } from '@/lib/queries/doctor-assignments'
import { listAppointmentsInRange } from '@/lib/queries/appointments'
import { PatientsTable } from '@/components/PatientsTable'
import { PatientAvatar } from '@/components/PatientAvatar'
import { AssignmentScheduleModalTrigger } from '@/components/AssignmentScheduleModal'
import { DashboardAppointmentsTable, type DashboardAppointmentRow } from '@/components/DashboardAppointmentsTable'

const TILE_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

function StatTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: keyof typeof TILE_COLOR }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4 shadow-none">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TILE_COLOR[color]}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default async function DoctorPortalPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  if (session.role !== 'pi') redirect('/')

  const patients = await listPatientsWithStatus(null)
  // No real doctor<->patient assignment table exists yet -- currentProvider
  // is free text (see the Design Decision note in seed.ts), and the seeded
  // roster spells the same doctor two different ways ("Dr. R. Kunam" vs
  // "Dr. Rajiv Kunam"). Match on last name so both forms resolve to the
  // same doctor rather than requiring an exact string match.
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const myPatients = patients.filter((p) => (p.currentProvider ?? '').toLowerCase().includes(lastName.toLowerCase()))

  // resolveSessionProvider is the real session<->provider-row link (see
  // provider-identity.ts); the last-name match below is now only a
  // FALLBACK for when it returns null. This page deliberately fails open on
  // that fallback rather than closed: it scopes a read-only dashboard
  // (which providers/assignments to display), not an attribution write, and
  // three of the five seeded providers have no linked login at all -- so
  // failing closed here would regress the demo for a display-only concern.
  const resolvedProvider = await resolveSessionProvider(session)
  const providerMatch = resolvedProvider ?? (await listActiveProviders()).find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  const pendingAssignments = providerMatch ? await listPendingAssignmentsForProvider(providerMatch.id) : []

  // Spec §6: `pi` is an allowed role to start a telemedicine session, but
  // (until this fix) had no UI entry point -- DashboardAppointmentsTable's
  // canStartTelemedicine action was only reachable via AdminDashboard /
  // CoordinatorDashboard. listAppointmentsInRange's `providerIds` filter
  // (same query AdminDashboard/CoordinatorDashboard use, scoped here to
  // just this pi's own matched provider row) does the ownership scoping at
  // the query level: if providerMatch didn't resolve, pass `[]` so nothing
  // renders rather than silently falling back to "all providers." Every row
  // returned already belongs to this pi, so canStartTelemedicine can be
  // unconditionally true -- there is no cross-provider row to gate per-row.
  const now = new Date()
  const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const myAppointments = await listAppointmentsInRange(rangeStart, rangeEnd, providerMatch ? [providerMatch.id] : [])

  await logAudit(session, 'viewed My Patients (doctor portal)', null)

  const meetsCount = myPatients.filter((p) => p.overallStatus === 'green').length
  const needsVerificationCount = myPatients.filter((p) => !p.overallStatus || p.overallStatus === 'yellow').length
  const exclusionCount = myPatients.filter((p) => p.overallStatus === 'red').length

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 rounded-md border border-border bg-card p-5 shadow-none">
        <PatientAvatar name={session.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Patients</h1>
          <p className="text-sm text-muted-foreground">Patients currently assigned to you, {session.name}.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Users} value={myPatients.length} label="Total assigned" color="primary" />
        <StatTile icon={CheckCircle2} value={meetsCount} label="Meets" color="success" />
        <StatTile icon={AlertTriangle} value={needsVerificationCount} label="Needs verification" color="warning" />
        <StatTile icon={XCircle} value={exclusionCount} label="Potential exclusion" color="destructive" />
      </div>

      {pendingAssignments.length > 0 && (
        <div className="mb-6 rounded-md border border-border bg-card p-5 shadow-none">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assigned to you</h2>
          <ul className="space-y-2">
            {pendingAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{a.reason}</p>
                  <p className="text-xs text-muted-foreground">{a.patientId} · {a.visitType} · {a.urgency}</p>
                </div>
                <AssignmentScheduleModalTrigger assignment={a} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 rounded-md border border-border bg-card p-5 shadow-none">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">My Appointments</h2>
        <DashboardAppointmentsTable
          appointments={myAppointments.map((a) => ({
            id: a.id, patientId: a.patientId, patientName: a.patientName, providerName: a.providerName,
            visitReason: a.visitReason, status: a.status, startsAt: a.startsAt.toString(),
          })) as DashboardAppointmentRow[]}
          canStartTelemedicine
        />
      </div>

      {/* Project down to only what PatientsTable renders -- see the same
          comment in patients/page.tsx. */}
      <PatientsTable patients={myPatients.map((p) => ({
        id: p.id,
        overallStatus: p.overallStatus,
        name: p.name,
        dob: p.dob,
        currentProvider: p.currentProvider,
        referralType: p.referralType,
        lastCommunication: p.lastCommunication,
        criteriaSummary: p.criteriaSummary,
      }))} />
    </div>
  )
}

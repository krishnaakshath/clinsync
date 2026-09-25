import { redirect } from 'next/navigation'
import { Users, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listActiveProviders } from '@/lib/queries/providers'
import { listPendingAssignmentsForProvider } from '@/lib/queries/doctor-assignments'
import { PatientsTable } from '@/components/PatientsTable'
import { PatientAvatar } from '@/components/PatientAvatar'
import { AssignmentScheduleModalTrigger } from '@/components/AssignmentScheduleModal'

const TILE_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

function StatTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: keyof typeof TILE_COLOR }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
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

  // Same last-name matching as myPatients above -- there's no real
  // session<->provider-row link yet, so this is the same best-effort match
  // used to resolve "this PI's own patients" applied to "this PI's own
  // provider row" for the assignment queue.
  const providers = await listActiveProviders()
  const providerMatch = providers.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  const pendingAssignments = providerMatch ? await listPendingAssignmentsForProvider(providerMatch.id) : []

  await logAudit(session, 'viewed My Patients (doctor portal)', null)

  const meetsCount = myPatients.filter((p) => p.overallStatus === 'green').length
  const needsVerificationCount = myPatients.filter((p) => !p.overallStatus || p.overallStatus === 'yellow').length
  const exclusionCount = myPatients.filter((p) => p.overallStatus === 'red').length

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
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
        <div className="mb-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
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

      {/* Project down to only what PatientsTable renders -- see the same
          comment in patients/page.tsx. */}
      <PatientsTable patients={myPatients.map((p) => ({
        id: p.id,
        overallStatus: p.overallStatus,
        nameTebra: p.nameTebra,
        nameIntakeq: p.nameIntakeq,
        dobTebra: p.dobTebra,
        dobIntakeq: p.dobIntakeq,
        currentProvider: p.currentProvider,
        referralType: p.referralType,
        lastCommunication: p.lastCommunication,
        criteriaSummary: p.criteriaSummary,
      }))} />
    </div>
  )
}

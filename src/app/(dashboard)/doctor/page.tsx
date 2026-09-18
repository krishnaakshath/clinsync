import { redirect } from 'next/navigation'
import { Users, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { PatientsTable } from '@/components/PatientsTable'
import { PatientAvatar } from '@/components/PatientAvatar'

const TILE_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-700',
  amber: 'bg-amber-500/10 text-amber-700',
  red: 'bg-red-500/10 text-red-700',
}

function StatTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: keyof typeof TILE_COLOR }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TILE_COLOR[color]}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
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

  await logAudit(session, 'viewed My Patients (doctor portal)', null)

  const meetsCount = myPatients.filter((p) => p.overallStatus === 'green').length
  const needsVerificationCount = myPatients.filter((p) => !p.overallStatus || p.overallStatus === 'yellow').length
  const exclusionCount = myPatients.filter((p) => p.overallStatus === 'red').length

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <PatientAvatar name={session.name} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-foreground">My Patients</h1>
          <p className="text-sm text-muted-foreground">Patients currently assigned to {session.name}.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Users} value={myPatients.length} label="Total assigned" color="primary" />
        <StatTile icon={CheckCircle2} value={meetsCount} label="Meets" color="emerald" />
        <StatTile icon={AlertTriangle} value={needsVerificationCount} label="Needs verification" color="amber" />
        <StatTile icon={XCircle} value={exclusionCount} label="Potential exclusion" color="red" />
      </div>

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
      }))} />
    </div>
  )
}

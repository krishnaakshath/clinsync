import { ClipboardCheck, BedDouble, ListChecks, ShieldCheck } from 'lucide-react'
import type { Session } from '@/lib/auth'
import { listAvailableRooms } from '@/lib/queries/rooms'
import { listTodaysAssignments } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'
import { countEligibilityFollowUps } from '@/lib/queries/insurance-eligibility'
import { CheckInButton } from '@/components/CheckInButton'
import { EligibilityCheckButton } from '@/components/EligibilityCheckButton'
import { AssignmentStatusChip } from '@/components/AssignmentStatusChip'

const URGENCY_ORDER = { emergency: 0, urgent: 1, routine: 2 } as const

function KpiTile({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export async function FrontDeskDashboard({ session }: { session: Session }) {
  // Today's assignments only -- listAllAssignments() (used by the full
  // /front-desk/assignments history page) would count and list every
  // assignment ever created, not just what actually happened today.
  const [rooms, assignments, providers, eligibilityFollowUpCount] = await Promise.all([
    listAvailableRooms(),
    listTodaysAssignments(),
    listActiveProviders(),
    countEligibilityFollowUps(),
  ])
  const providerName = (id: number) => providers.find((p) => p.id === id)?.name ?? `Provider #${id}`
  const pendingCount = assignments.filter((a) => a.status === 'pending').length
  const sortedAssignments = [...assignments].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])

  return (
    <div>
      <div className="mb-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-foreground">Front Desk</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {session.name}.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={ClipboardCheck} value={pendingCount} label="Pending assignments" />
        <KpiTile icon={BedDouble} value={rooms.length} label="Rooms available" />
        <KpiTile icon={ListChecks} value={assignments.length} label="Total checked in today" />
        <KpiTile icon={ShieldCheck} value={eligibilityFollowUpCount} label="Eligibility follow-ups" />
      </div>

      <div className="mb-6 flex gap-3">
        <CheckInButton providers={providers} rooms={rooms} />
        <EligibilityCheckButton />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Doctor</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgency</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedAssignments.map((a, i) => (
              <tr key={a.id} className={`border-b border-border last:border-b-0 ${i % 2 === 1 ? 'bg-muted/40' : ''}`}>
                <td className="p-3 text-foreground">{a.patientId}</td>
                <td className="p-3 text-foreground">{providerName(a.providerId)}</td>
                <td className="p-3 text-foreground">{a.reason}</td>
                <td className="p-3 capitalize text-foreground">{a.urgency}</td>
                <td className="p-3"><AssignmentStatusChip status={a.status} declineReason={a.declineReason} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

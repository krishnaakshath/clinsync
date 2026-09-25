import { ClipboardCheck, BedDouble, ListChecks, ShieldCheck } from 'lucide-react'
import type { Session } from '@/lib/auth'
import { listAvailableRooms } from '@/lib/queries/rooms'
import { listAllAssignments } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'
import { CheckInButton } from '@/components/CheckInButton'
import { EligibilityCheckButton } from '@/components/EligibilityCheckButton'

const URGENCY_ORDER = { emergency: 0, urgent: 1, routine: 2 } as const
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', scheduled: 'Scheduled', declined: 'Declined' }
const STATUS_COLOR: Record<string, string> = { pending: 'text-warning', scheduled: 'text-success', declined: 'text-destructive' }

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
  const [rooms, assignments, providers] = await Promise.all([listAvailableRooms(), listAllAssignments(), listActiveProviders()])
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
        <KpiTile icon={ShieldCheck} value={0} label="Eligibility follow-ups" />
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
                <td className={`p-3 font-medium ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

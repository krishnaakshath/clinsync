import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listAllAssignments } from '@/lib/queries/doctor-assignments'
import { listAllProviders } from '@/lib/queries/providers'

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', scheduled: 'Scheduled', declined: 'Declined — needs reassignment' }
const STATUS_COLOR: Record<string, string> = { pending: 'text-warning', scheduled: 'text-success', declined: 'text-destructive' }

export default async function FrontDeskAssignmentsPage() {
  const session = await requireSessionOrRedirect()
  if (!['frontdesk', 'admin', 'crc'].includes(session.role)) redirect('/')

  const [assignments, providers] = await Promise.all([listAllAssignments(), listAllProviders()])
  await logAudit(session, 'viewed front desk assignments', null)

  const providerName = (id: number) => providers.find((p) => p.id === id)?.name ?? `Provider #${id}`

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Assignments</h1>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Doctor</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visit Type</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr key={a.id} className={`border-b border-border last:border-b-0 ${i % 2 === 1 ? 'bg-muted/40' : ''}`}>
                <td className="p-3 text-foreground">{a.patientId}</td>
                <td className="p-3 text-foreground">{providerName(a.providerId)}</td>
                <td className="p-3 text-foreground capitalize">{a.visitType}</td>
                <td className="p-3 text-foreground">{a.reason}</td>
                <td className={`p-3 font-medium ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}{a.status === 'declined' && a.declineReason ? ` (${a.declineReason})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

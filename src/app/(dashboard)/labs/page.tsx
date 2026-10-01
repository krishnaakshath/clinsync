import { redirect } from 'next/navigation'
import { ClipboardList, Beaker, CheckCircle2, AlertTriangle } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { CountUp } from '@/components/CountUp'
import { logAudit } from '@/lib/audit'
import { listWorklist } from '@/lib/queries/lab-orders'
import { listLabTests } from '@/lib/queries/lab-tests'
import { LabWorklist } from '@/components/LabWorklist'

function StatTile({ value, label, icon: Icon, tone }: { value: number; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground"><CountUp to={value} /></p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default async function LabsPage() {
  const session = await requireSessionOrRedirect()
  // Matches GET /api/lab-orders's own role gate. frontdesk removed per
  // explicit product direction (registration/check-in only, no lab access).
  if (!['admin', 'pi', 'crc', 'labs'].includes(session.role)) redirect('/')

  const [orders, labTests] = await Promise.all([listWorklist(), listLabTests()])
  await logAudit(session, session.role === 'labs' ? 'viewed labs dashboard' : 'viewed lab worklist', null)

  const pending = orders.filter((o) => o.status === 'ordered').length
  const inProgress = orders.filter((o) => o.status === 'collected').length
  const resultedToday = orders.filter((o) => o.status === 'resulted' && o.collectedAt && isToday(o.collectedAt)).length

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{session.role === 'labs' ? `Hello, ${session.name}!` : 'Labs'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage internal collections and external reference lab results.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LIS Integration</span>
            <span className="flex items-center gap-1.5 text-xs text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
              </span>
              Connected (HL7 / FHIR)
            </span>
          </div>
        </div>
      </div>

      {session.role === 'labs' && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={pending} label="Awaiting Collection" icon={ClipboardList} tone="bg-warning/10 text-warning" />
          <StatTile value={inProgress} label="Awaiting Results" icon={Beaker} tone="bg-accent/10 text-accent" />
          <StatTile value={resultedToday} label="Resulted Today" icon={CheckCircle2} tone="bg-success/10 text-success" />
          <StatTile value={orders.filter((o) => o.status !== 'cancelled').length} label="Active Orders" icon={AlertTriangle} tone="bg-primary/10 text-primary" />
        </div>
      )}

      <LabWorklist orders={orders} labTests={labTests} role={session.role} />
    </div>
  )
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

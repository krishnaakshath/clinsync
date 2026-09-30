import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listWorklist } from '@/lib/queries/lab-orders'
import { listLabTests } from '@/lib/queries/lab-tests'
import { LabWorklist } from '@/components/LabWorklist'

export default async function LabsPage() {
  const session = await requireSessionOrRedirect()
  // Matches GET /api/lab-orders's own role gate.
  if (!['admin', 'pi', 'crc', 'frontdesk'].includes(session.role)) redirect('/')

  const [orders, labTests] = await Promise.all([listWorklist(), listLabTests()])
  await logAudit(session, 'viewed lab worklist', null)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Labs</h1>
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
      <LabWorklist orders={orders} labTests={labTests} role={session.role} />
    </div>
  )
}

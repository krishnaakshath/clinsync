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
      <h1 className="mb-6 text-2xl font-bold text-foreground">Labs</h1>
      <LabWorklist orders={orders} labTests={labTests} role={session.role} />
    </div>
  )
}

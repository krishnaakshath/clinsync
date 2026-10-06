import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { listAllAppointmentsReport } from '@/lib/queries/reports'
import { AllAppointmentsReportTable } from '@/components/AllAppointmentsReportTable'

export default async function AllAppointmentsReportPage() {
  const session = await requireSessionOrRedirect()
  if (!canAccessOperations(session.role)) redirect('/')
  const rows = await listAllAppointmentsReport()
  await logAudit(session, 'viewed report: all appointments', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">All Appointments</h1>
      <AllAppointmentsReportTable rows={rows} />
    </div>
  )
}

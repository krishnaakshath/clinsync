import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { PatientsReportTable } from '@/components/PatientsReportTable'

export default async function PatientsReportPage() {
  const session = await requireSessionOrRedirect()
  const patients = await listPatientsWithStatus(null)
  await logAudit(session, 'viewed report: all patients', null)

  const rows = patients.map((p) => ({
    id: p.id,
    displayName: p.nameTebra ?? p.nameIntakeq,
    dob: p.dobTebra ?? p.dobIntakeq,
    currentProvider: p.currentProvider,
    overallStatus: p.overallStatus,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">All Patients</h1>
      <PatientsReportTable rows={rows} />
    </div>
  )
}

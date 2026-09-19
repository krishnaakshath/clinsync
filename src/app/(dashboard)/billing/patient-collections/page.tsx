import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientCollections } from '@/lib/queries/patient-collections'
import { PatientCollectionsTable } from '@/components/PatientCollectionsTable'

export default async function PatientCollectionsPage() {
  const session = await requireSessionOrRedirect()
  const rows = await listPatientCollections()
  await logAudit(session, 'viewed patient collections', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Patient Collections</h1>
      <PatientCollectionsTable rows={rows} />
    </div>
  )
}

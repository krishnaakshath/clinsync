import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listAllEncountersReport } from '@/lib/queries/reports'
import { AllEncountersReportTable } from '@/components/AllEncountersReportTable'

export default async function AllEncountersReportPage() {
  const session = await requireSessionOrRedirect()
  const rows = await listAllEncountersReport()
  await logAudit(session, 'viewed report: all encounters', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">All Encounters</h1>
      <AllEncountersReportTable rows={rows} />
    </div>
  )
}

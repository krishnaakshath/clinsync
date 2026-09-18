import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listInsuranceCollectionsReport } from '@/lib/queries/reports'
import { InsuranceCollectionsReportTable } from '@/components/InsuranceCollectionsReportTable'

export default async function InsuranceCollectionsReportPage() {
  const session = await requireSessionOrRedirect()
  const rows = await listInsuranceCollectionsReport()
  await logAudit(session, 'viewed report: insurance collections', null)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-foreground">Insurance Collections</h1>
      <InsuranceCollectionsReportTable rows={rows} />
    </div>
  )
}

import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFaxes } from '@/lib/queries/faxes'
import { FaxHistoryReportTable } from '@/components/FaxHistoryReportTable'

export default async function FaxHistoryPage() {
  const session = await requireSessionOrRedirect()
  const faxes = await listFaxes()
  await logAudit(session, 'viewed fax history', null)

  return <FaxHistoryReportTable rows={faxes} />
}

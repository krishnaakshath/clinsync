import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { listFaxes } from '@/lib/queries/faxes'
import { FaxHistoryReportTable } from '@/components/FaxHistoryReportTable'

export default async function FaxHistoryPage() {
  const session = await requireSessionOrRedirect()
  if (!canAccessOperations(session.role)) redirect('/')
  const faxes = await listFaxes()
  await logAudit(session, 'viewed fax history', null)

  // Date labels are formatted here on the server and passed down, so the
  // client table's hydration render can't disagree with this HTML.
  return <FaxHistoryReportTable rows={faxes.map((f) => ({ ...f, faxDateLabel: new Date(f.faxDate).toLocaleString() }))} />
}

import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { listDocuments } from '@/lib/queries/documents'
import { DocumentsReportTable } from '@/components/DocumentsReportTable'

export default async function DocumentsPage() {
  const session = await requireSessionOrRedirect()
  if (!canAccessOperations(session.role)) redirect('/')
  const documents = await listDocuments()
  await logAudit(session, 'viewed documents', null)

  return <DocumentsReportTable rows={documents} />
}

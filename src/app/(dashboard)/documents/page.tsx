import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listDocuments } from '@/lib/queries/documents'
import { DocumentsReportTable } from '@/components/DocumentsReportTable'

export default async function DocumentsPage() {
  const session = await requireSessionOrRedirect()
  // LeftNav.tsx:61 — the Documents section is rendered for admin/crc only.
  // Same list, same redirect target as workbook/page.tsx:12.
  if (!['admin', 'crc'].includes(session.role)) redirect('/')
  const documents = await listDocuments()
  await logAudit(session, 'viewed documents', null)

  return <DocumentsReportTable rows={documents} />
}

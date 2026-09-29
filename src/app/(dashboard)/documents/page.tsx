import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listDocuments } from '@/lib/queries/documents'
import { listPatientNameOptions } from '@/lib/queries/patients'
import { listActiveAdmissions } from '@/lib/queries/admissions'
import { DocumentsReportTable } from '@/components/DocumentsReportTable'

export default async function DocumentsPage() {
  const session = await requireSessionOrRedirect()
  const [documents, patientOptions, activeAdmissions] = await Promise.all([
    listDocuments(),
    listPatientNameOptions(),
    listActiveAdmissions(),
  ])
  await logAudit(session, 'viewed documents', null)

  return (
    <DocumentsReportTable
      rows={documents.map((d) => ({ ...d, filedAt: d.filedAt ? d.filedAt.toISOString() : null }))}
      patientOptions={patientOptions}
      activeAdmissions={activeAdmissions.map((a) => ({ ...a, admittedAt: a.admittedAt.toISOString() }))}
      canWrite={['admin', 'crc', 'frontdesk'].includes(session.role)}
      canDelete={session.role === 'admin'}
    />
  )
}

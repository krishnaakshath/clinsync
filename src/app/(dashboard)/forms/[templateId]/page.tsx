import { notFound, redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormTemplate } from '@/lib/queries/form-templates'
import { listFormTemplateFolders } from '@/lib/queries/form-template-folders'
import { listConsentsForTemplate } from '@/lib/queries/form-template-consents'
import { listConsentDocuments } from '@/lib/queries/consent-documents'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { FormBuilderEditor } from '@/components/FormBuilderEditor'

export default async function FormTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireSessionOrRedirect()
  if (!['admin', 'crc'].includes(session.role)) redirect('/')
  const { templateId } = await params
  const template = await getFormTemplate(Number(templateId))
  if (!template) notFound()
  const [folders, attachedConsents, consentDocuments, patients] = await Promise.all([
    listFormTemplateFolders(),
    listConsentsForTemplate(template.id),
    listConsentDocuments(),
    listPatientsWithStatus(null),
  ])
  await logAudit(session, `viewed form template ${templateId}`, null)

  return (
    <FormBuilderEditor
      templateId={template.id}
      initialName={template.name}
      initialCategory={template.category}
      initialDiagnosisTag={template.diagnosisTag}
      initialQuestions={template.questions}
      initialFolderId={template.folderId}
      initialIsActive={template.isActive}
      folders={folders.map((f) => ({ id: f.id, name: f.name }))}
      attachedConsents={attachedConsents}
      allConsentDocuments={consentDocuments.map((d) => ({ id: d.id, name: d.name }))}
      // Project to what SendFormModal's prop type requires; never ship full patient rows to the client.
      patients={patients.map(({ id, nameTebra, nameIntakeq }) => ({ id, nameTebra, nameIntakeq }))}
    />
  )
}

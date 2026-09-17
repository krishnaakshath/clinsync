import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormTemplate } from '@/lib/queries/form-templates'
import { FormBuilderEditor } from '@/components/FormBuilderEditor'

export default async function FormTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireSessionOrRedirect()
  const { templateId } = await params
  const template = await getFormTemplate(Number(templateId))
  if (!template) notFound()
  await logAudit(session, `viewed form template ${templateId}`, null)

  return (
    <FormBuilderEditor
      templateId={template.id}
      initialName={template.name}
      initialCategory={template.category}
      initialDiagnosisTag={template.diagnosisTag}
      initialQuestions={template.questions}
    />
  )
}

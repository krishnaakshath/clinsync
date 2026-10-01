import { notFound, redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormTemplate } from '@/lib/queries/form-templates'
import { FormBuilderEditor } from '@/components/FormBuilderEditor'

export default async function FormTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireSessionOrRedirect()
  // LeftNav.tsx:50 — the Form Templates entry is rendered for admin/crc/pi.
  // Must precede notFound() below, not follow it. (This was previously
  // admin/crc only, stale against LeftNav and against forms/page.tsx's own
  // gate -- a pi could see "Form Templates" in nav and the list page, but
  // got redirected home the moment they opened one.)
  if (!['admin', 'crc', 'pi'].includes(session.role)) redirect('/')
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

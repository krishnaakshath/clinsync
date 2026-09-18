import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormSubmission } from '@/lib/queries/form-submissions'

export default async function ClientFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect()
  const { id } = await params
  const submission = await getFormSubmission(Number(id))
  if (!submission) notFound()
  await logAudit(session, `viewed client form ${id}`, submission.patientId)

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-foreground">{submission.templateName}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{submission.patientName} · <span className="capitalize">{submission.status}</span></p>
      <div className="space-y-3">
        {submission.questions.map((q) => (
          <div key={q.id} className="rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.label}</p>
            <p className="text-sm text-foreground">{submission.answers?.[q.id] ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

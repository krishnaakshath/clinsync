import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormSubmission } from '@/lib/queries/form-submissions'
import { formatAnswerDisplay } from '@/lib/form-answers'

export default async function ClientFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect()
  const { id } = await params
  const submission = await getFormSubmission(Number(id))
  if (!submission) notFound()
  await logAudit(session, `viewed client form ${id}`, submission.patientId)

  return (
    <div className="max-w-2xl">
      <Link href="/client-forms" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">← Client Forms</Link>
      <h1 className="mb-1 text-2xl font-bold text-foreground">{submission.templateName}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{submission.patientName} · <span className="capitalize">{submission.status}</span></p>
      <div className="space-y-3">
        {submission.questions.map((q) => {
          const rawValue = submission.answers?.[q.id]
          return (
            <div key={q.id} className="rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.label}</p>
              {q.type === 'select' && q.options && q.options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((option) => {
                    const selected = rawValue === option
                    return (
                      <span
                        key={option}
                        className={selected
                          ? 'rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
                          : 'rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground'}
                      >
                        {option}
                      </span>
                    )
                  })}
                  {rawValue && !q.options.includes(rawValue) && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{rawValue}</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-foreground">{formatAnswerDisplay(q, rawValue)}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

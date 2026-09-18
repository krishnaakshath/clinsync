'use client'
import { useState } from 'react'

interface Question { id: string; label: string; type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox'; options?: string[]; required: boolean }

function isAnswered(question: Question, value: string | undefined): boolean {
  if (question.type === 'checkbox') return value !== undefined
  return !!value?.trim()
}

export function IntakePortalForm({ token, questions, existingAnswers, autofill }: {
  token: string
  questions: Question[]
  existingAnswers: Record<string, string>
  autofill: Record<string, string>
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({ ...autofill, ...existingAnswers })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  async function submit(complete: boolean) {
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/intake/${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, complete }),
    })
    setSubmitting(false)
    if (!res.ok) { setError('Something went wrong saving your answers. Please try again.'); return }
    if (complete) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Thank you — your form has been submitted.</p>
        <p className="mt-1 text-sm text-muted-foreground">You may close this page.</p>
      </div>
    )
  }

  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length
  const progressPercent = questions.length === 0 ? 0 : Math.round((answeredCount / questions.length) * 100)
  const requiredMissing = questions.some((q) => q.required && !isAnswered(q, answers[q.id]))

  return (
    <div>
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{answeredCount} of {questions.length} question{questions.length === 1 ? '' : 's'} answered</span>
          <span className="tabular-nums text-primary">{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id}>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {q.label}{q.required && <span aria-hidden="true"> *</span>}
            </label>
            {q.type === 'textarea' ? (
              <textarea value={answers[q.id] ?? ''} onChange={(e) => update(q.id, e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary/40 focus:outline-none" rows={3} />
            ) : q.type === 'select' ? (
              <select value={answers[q.id] ?? ''} onChange={(e) => update(q.id, e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary/40 focus:outline-none">
                <option value="">Select…</option>
                {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : q.type === 'checkbox' ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={answers[q.id] === 'true'} onChange={(e) => update(q.id, e.target.checked ? 'true' : 'false')} />
                I agree
              </label>
            ) : (
              <input type={q.type === 'date' ? 'date' : 'text'} value={answers[q.id] ?? ''} onChange={(e) => update(q.id, e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary/40 focus:outline-none" />
            )}
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex justify-between pt-2">
        <button onClick={() => submit(false)} disabled={submitting} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50">Save and finish later</button>
        <button onClick={() => submit(true)} disabled={submitting || requiredMissing} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Submit</button>
      </div>
    </div>
  )
}

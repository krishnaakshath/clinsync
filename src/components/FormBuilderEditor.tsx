'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Trash2, Plus, ShieldAlert } from 'lucide-react'

interface Question {
  id: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox'
  options?: string[]
  hipaaSensitive: boolean
  required: boolean
}

export function FormBuilderEditor({ templateId, initialName, initialCategory, initialDiagnosisTag, initialQuestions }: {
  templateId: number
  initialName: string
  initialCategory: string
  initialDiagnosisTag: string
  initialQuestions: Question[]
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState(initialCategory)
  const [diagnosisTag, setDiagnosisTag] = useState(initialDiagnosisTag)
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [saving, setSaving] = useState(false)

  function addQuestion() {
    setQuestions([...questions, { id: `q${Date.now()}`, label: 'New question', type: 'text', hipaaSensitive: false, required: false }])
  }

  function removeQuestion(id: string) {
    setQuestions(questions.filter((q) => q.id !== id))
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const next = [...questions]
    ;[next[index], next[target]] = [next[target], next[index]]
    setQuestions(next)
  }

  function addOption(id: string) {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, options: [...(q.options ?? []), ''] } : q)))
  }

  function removeOption(id: string, index: number) {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, options: (q.options ?? []).filter((_, i) => i !== index) } : q)))
  }

  function updateOption(id: string, index: number, value: string) {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, options: (q.options ?? []).map((o, i) => (i === index ? value : o)) } : q)))
  }

  function moveOption(id: string, index: number, direction: -1 | 1) {
    setQuestions(questions.map((q) => {
      if (q.id !== id) return q
      const opts = [...(q.options ?? [])]
      const target = index + direction
      if (target < 0 || target >= opts.length) return q
      ;[opts[index], opts[target]] = [opts[target], opts[index]]
      return { ...q, options: opts }
    }))
  }

  async function save() {
    setSaving(true)
    // Drop blank option rows (e.g. an "+ Add option" click the user never
    // filled in) so choice questions don't ship empty entries to patients.
    const cleaned = questions.map((q) => (q.type === 'select' ? { ...q, options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) } : q))
    const res = await fetch(`/api/form-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, diagnosisTag, questions: cleaned }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
  }

  return (
    <div className="max-w-2xl">
      <Link href="/forms" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">← Form Templates</Link>
      <div className="mb-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Form name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-lg font-semibold text-foreground" />
          </div>
          <div className="flex gap-3">
            <div className="w-1/2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </div>
            <div className="w-1/2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Diagnosis tag</label>
              <input value={diagnosisTag} onChange={(e) => setDiagnosisTag(e.target.value)} placeholder="Diagnosis tag" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
              <input value={q.label} onChange={(e) => updateQuestion(q.id, { label: e.target.value })} className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground focus:border-primary/40 focus:outline-none" />
              <select value={q.type} onChange={(e) => updateQuestion(q.id, { type: e.target.value as Question['type'] })} className="rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary/40 focus:outline-none">
                <option value="text">Text</option>
                <option value="textarea">Long text</option>
                <option value="date">Date</option>
                <option value="select">Select</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <div className="flex shrink-0 items-center gap-0.5">
                <button onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
                <button onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
                <button onClick={() => removeQuestion(q.id)} aria-label="Remove question" className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pl-8 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} /> Required</label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={q.hipaaSensitive} onChange={(e) => updateQuestion(q.id, { hipaaSensitive: e.target.checked })} />
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Contains PHI
                </span>
              </label>
            </div>

            {q.type === 'select' && (
              <div className="mt-3 space-y-1.5 border-t border-border pl-8 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Options</p>
                {(q.options ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No options yet — add at least one so patients have something to choose.</p>
                )}
                {(q.options ?? []).map((option, oi) => (
                  <div key={oi} className="flex items-center gap-1.5">
                    <input
                      value={option}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      aria-label={`Option ${oi + 1} for ${q.label}`}
                      className="flex-1 rounded-md border border-border px-2 py-1 text-xs text-foreground focus:border-primary/40 focus:outline-none"
                    />
                    <button onClick={() => moveOption(q.id, oi, -1)} disabled={oi === 0} aria-label="Move option up" className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowUp className="h-3 w-3" aria-hidden="true" /></button>
                    <button onClick={() => moveOption(q.id, oi, 1)} disabled={oi === (q.options?.length ?? 0) - 1} aria-label="Move option down" className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowDown className="h-3 w-3" aria-hidden="true" /></button>
                    <button onClick={() => removeOption(q.id, oi)} aria-label="Remove option" className="rounded-md p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                ))}
                <button onClick={() => addOption(q.id)} className="text-xs font-medium text-primary hover:underline">+ Add option</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between">
        <button onClick={addQuestion} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add New Question
        </button>
        <button onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Form'}
        </button>
      </div>
    </div>
  )
}

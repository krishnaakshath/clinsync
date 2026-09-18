'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/form-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, diagnosisTag, questions }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-lg font-semibold text-foreground" />
        <div className="flex gap-2">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="w-1/2 rounded-md border border-border px-3 py-2 text-sm" />
          <input value={diagnosisTag} onChange={(e) => setDiagnosisTag(e.target.value)} placeholder="Diagnosis tag" className="w-1/2 rounded-md border border-border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{i + 1}.</span>
              <input value={q.label} onChange={(e) => updateQuestion(q.id, { label: e.target.value })} className="flex-1 rounded-md border border-border px-2 py-1 text-sm text-foreground" />
              <select value={q.type} onChange={(e) => updateQuestion(q.id, { type: e.target.value as Question['type'] })} className="rounded-md border border-border px-2 py-1 text-xs">
                <option value="text">Text</option>
                <option value="textarea">Long text</option>
                <option value="date">Date</option>
                <option value="select">Select</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex gap-3">
                <label className="flex items-center gap-1"><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} /> Required</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={q.hipaaSensitive} onChange={(e) => updateQuestion(q.id, { hipaaSensitive: e.target.checked })} /> Contains PHI</label>
              </div>
              <div className="flex gap-1">
                <button onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded px-2 py-0.5 hover:bg-secondary disabled:opacity-30">↑</button>
                <button onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="rounded px-2 py-0.5 hover:bg-secondary disabled:opacity-30">↓</button>
                <button onClick={() => removeQuestion(q.id)} aria-label="Remove question" className="rounded px-2 py-0.5 text-destructive hover:bg-secondary">Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between">
        <button onClick={addQuestion} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">+ Add New Question</button>
        <button onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Save Form</button>
      </div>
    </div>
  )
}

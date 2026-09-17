'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SendFormModal({ templates, patients, onClose }: {
  templates: { id: number; name: string }[]
  patients: { id: string; nameTebra: string | null; nameIntakeq: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [patientId, setPatientId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    const res = await fetch('/api/form-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, patientId }),
    })
    setSubmitting(false)
    if (res.ok) { router.refresh(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Send Form to Client</h2>
        <div className="space-y-3">
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">Select a client…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.nameTebra ?? p.nameIntakeq} ({p.id})</option>)}
          </select>
          <select value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">Select a form…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={submit} disabled={submitting || !templateId || !patientId} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Send Form</button>
        </div>
      </div>
    </div>
  )
}

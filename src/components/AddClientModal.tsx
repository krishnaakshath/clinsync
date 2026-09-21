'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface NewPatientForm {
  name: string
  dob: string
  email: string
  phone: string
  city: string
  zip: string
  currentProvider: string
}

const EMPTY_FORM: NewPatientForm = {
  name: '', dob: '', email: '', phone: '', city: '', zip: '', currentProvider: '',
}

export function AddClientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState<NewPatientForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof NewPatientForm>(key: K, value: NewPatientForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        dob: form.dob,
        email: form.email || undefined,
        phone: form.phone || undefined,
        city: form.city || undefined,
        zip: form.zip || undefined,
        currentProvider: form.currentProvider || undefined,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setError('Could not add this patient. Please check the details and try again.')
      return
    }
    // Navigate straight to the new patient's detail page rather than just
    // refreshing the current page -- an admin who just added a patient
    // wants to see it, not go find it themselves in the list.
    const created = await res.json()
    onClose()
    router.push(`/patients/${created.id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Add New Patient</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          This creates a new chart in Tebra -- Clinsync doesn&apos;t store patient records of its own.
        </p>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic info</p>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Full name" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <input value={form.dob} onChange={(e) => update('dob', e.target.value)} type="date" aria-label="Date of birth" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="Email (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Phone (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="City (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            <input value={form.zip} onChange={(e) => update('zip', e.target.value)} placeholder="Zip (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Care details</p>
          <input value={form.currentProvider} onChange={(e) => update('currentProvider', e.target.value)} placeholder="Current provider (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={submit} disabled={submitting || !form.name || !form.dob} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

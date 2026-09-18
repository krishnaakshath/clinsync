'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AddClientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameIntakeq: name, dobIntakeq: dob, emailIntakeq: email || undefined }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setError('Could not add this client. Please check the details and try again.')
      return
    }
    // Navigate straight to the new patient's detail page rather than just
    // refreshing the current (Home) page -- an admin who just added a
    // patient wants to see it, not go find it themselves in the list.
    const created = await res.json()
    onClose()
    router.push(`/patients/${created.id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Add New Client</h2>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <input value={dob} onChange={(e) => setDob(e.target.value)} type="date" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={submit} disabled={submitting || !name || !dob} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

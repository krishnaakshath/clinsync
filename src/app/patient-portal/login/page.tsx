'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PatientPortalLoginPage() {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/patient-portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? 'Could not sign in.')
      return
    }
    router.push('/patient-portal')
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-xl border border-primary/10 bg-card/80 p-6 shadow-sm backdrop-blur-sm">
        <h1 className="mb-1 text-xl font-bold text-foreground">Patient Sign In</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Use the patient ID and password your care team gave you. If you don&apos;t have one yet, ask your provider&apos;s office.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="patientId" className="mb-1 block text-xs font-medium text-muted-foreground">Patient ID</label>
            <input id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="RD-0001" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={submitting || !patientId || !password} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

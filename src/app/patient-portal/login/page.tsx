'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Pill, MessageSquare, LockKeyhole } from 'lucide-react'
import { IpmgIcon } from '@/components/IpmgLogo'

const HIGHLIGHTS = [
  { icon: FileText, text: 'Forms' },
  { icon: Pill, text: 'Medications' },
  { icon: MessageSquare, text: 'Messages' },
]

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
    // Deliberately its own visual treatment, not the staff login's dark
    // split-panel -- a patient signing in from home should land somewhere
    // that reads as calm and consumer-facing, not an internal ops tool.
    // Centered card on a soft tinted ground instead.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-secondary/40 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-primary/10 to-transparent"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <IpmgIcon className="h-8 w-auto" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">Clinsync Patient Portal</p>
            <p className="text-sm text-muted-foreground">Inland Psychiatric Medical Group</p>
          </div>
        </div>

        <div className="rounded-2xl border border-primary/10 bg-card p-7 shadow-md">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with the patient ID and password your care team gave you.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="patientId" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient ID</label>
              <input
                id="patientId"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="RD-0001"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !patientId || !password}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            Your health information is private and secure
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-6">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-1.5 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">{text}</span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have a patient ID or password yet? Ask your provider&apos;s office.
        </p>
      </div>
    </div>
  )
}

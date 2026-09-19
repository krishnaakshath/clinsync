'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Pill, MessageSquare } from 'lucide-react'
import { IpmgIcon, IpmgWordmark } from '@/components/IpmgLogo'

const HIGHLIGHTS = [
  { icon: FileText, text: 'Fill out and track any forms your care team has sent you' },
  { icon: Pill, text: 'See your current and past medications on file' },
  { icon: MessageSquare, text: 'Message your care team directly' },
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
    <div className="flex min-h-screen bg-background">
      {/* Same identity-panel treatment as the staff login page, so the
          patient-facing portal reads as part of the same product rather
          than a bare, unbranded form bolted on separately. */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '28px 28px' }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <div className="rounded-lg bg-white/95 px-3 py-2">
            <IpmgIcon className="h-6 w-auto" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Patient Portal</span>
        </div>
        <div className="relative space-y-8">
          <h2 className="max-w-sm text-3xl font-bold leading-tight">Your care, your records, all in one place.</h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm text-sidebar-foreground/80">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">A secure portal for patients in active pre-screening</p>
      </div>

      <div className="flex w-full flex-1 flex-col items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-1 lg:hidden">
            <IpmgWordmark className="h-10 w-auto" />
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Patient Sign In</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the patient ID and password your care team gave you. If you don&apos;t have one yet, ask your provider&apos;s office.
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
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !patientId || !password}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

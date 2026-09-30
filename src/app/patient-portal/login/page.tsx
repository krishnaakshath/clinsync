'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Pill, MessageSquare, LockKeyhole, Activity } from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { MfaCodeStep } from '@/components/mfa/MfaCodeStep'

const HIGHLIGHTS = [
  { icon: FileText, text: 'Forms & Documents' },
  { icon: Pill, text: 'Medication Tracker' },
  { icon: MessageSquare, text: 'Care Team Messages' },
  { icon: Activity, text: 'Lab Results' },
]

export default function PatientPortalLoginPage() {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [needsMfa, setNeedsMfa] = useState(false)

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
    const body = await res.json()
    if (body.mfaRequired) {
      setNeedsMfa(true)
      return
    }
    router.push('/patient-portal')
  }

  async function submitMfaCode(code: string): Promise<string | null> {
    const res = await fetch('/api/patient-portal/login/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return body?.error ?? 'Could not verify that code.'
    }
    router.push('/patient-portal')
    return null
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fafafa] px-4 py-10 selection:bg-primary/20">
      {/* Soft abstract background blobs */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 transform">
        <div className="h-[600px] w-[1000px] rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <ClinsyncLogo className="text-3xl font-extrabold tracking-tight text-foreground" />
          <span className="mt-2 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Patient Portal
          </span>
        </div>

        {/* Main Login Card */}
        <div className="rounded-3xl border border-border/50 bg-white p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
          {needsMfa ? (
            <MfaCodeStep
              title="Enter your code"
              description="Open your authenticator app and enter the current 6-digit code."
              onSubmit={submitMfaCode}
              onBack={() => setNeedsMfa(false)}
            />
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in with the patient ID and password your care team provided.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="patientId" className="text-sm font-medium leading-none">
                    Patient ID
                  </label>
                  <input
                    id="patientId"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="RD-0001"
                    className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium leading-none">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {error}
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={submitting || !patientId || !password}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? 'Signing in…' : 'Sign in to My Health'}
                </button>
              </form>

              <div className="mt-8 flex items-center justify-center gap-2 border-t border-border/50 pt-6 text-xs font-medium text-muted-foreground">
                <LockKeyhole className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span>Your health information is private and secure (HIPAA)</span>
              </div>
            </>
          )}
        </div>

        {/* Feature Highlights Footer */}
        {!needsMfa && (
          <div className="mt-10">
            <div className="grid grid-cols-4 gap-4 px-2">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center gap-2 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-border/50">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <span className="text-[10px] font-medium leading-tight text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>
            
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Don&apos;t have a patient ID or password yet? <br />
              <a href="#" className="font-medium text-primary hover:underline">Contact your provider&apos;s office</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

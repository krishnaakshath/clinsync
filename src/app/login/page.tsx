'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { MfaCodeStep } from '@/components/mfa/MfaCodeStep'
import { MfaEnrollStep } from '@/components/mfa/MfaEnrollStep'
import { LoginBackdrop } from '@/components/LoginBackdrop'

type Step =
  | { kind: 'password' }
  | { kind: 'enroll'; qrDataUrl: string; manualKey: string }
  | { kind: 'verify' }

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<Step>({ kind: 'password' })

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setError('Invalid email or password.')
      return
    }
    const body = await res.json()
    setStep(body.mode === 'enroll' ? { kind: 'enroll', qrDataUrl: body.qrDataUrl, manualKey: body.manualKey } : { kind: 'verify' })
  }

  async function submitMfaCode(code: string): Promise<string | null> {
    const res = await fetch('/api/login/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return body?.error ?? 'Could not verify that code.'
    }
    router.push('/')
    router.refresh()
    return null
  }

  // A centered sign-in over a quiet animated grid (see LoginBackdrop; plain
  // canvas, single brand hue). The form itself stays plain and fast --
  // this is a tool clinicians open dozens of times a day.
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Subtle animated grid backdrop (canvas 2D, single brand hue). */}
      <LoginBackdrop />
      <div className="w-full max-w-sm">
        <div className="login-brand-in mb-8 flex flex-col items-center gap-3 text-center">
          <span className="login-logo-ring flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ">
            <ClinsyncLogo className="h-6 w-6" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-foreground">Clinsync</span>
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Clinical operations, connected</span>
        </div>
        <div className="login-card-in rounded-2xl border border-border bg-card/95 p-7 shadow-lg shadow-primary/5 backdrop-blur-sm">
          {step.kind === 'password' && (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-xl font-bold text-foreground">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">Welcome back to your workspace.</p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                Access is logged and restricted to authorized staff.
              </p>
            </>
          )}
          {step.kind === 'enroll' && (
            <MfaEnrollStep qrDataUrl={step.qrDataUrl} manualKey={step.manualKey} onSubmit={submitMfaCode} />
          )}
          {step.kind === 'verify' && (
            <MfaCodeStep
              title="Enter your code"
              description="Open your authenticator app and enter the current 6-digit code."
              onSubmit={submitMfaCode}
              onBack={() => setStep({ kind: 'password' })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

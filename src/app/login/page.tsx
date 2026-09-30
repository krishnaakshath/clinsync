'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Activity, Users } from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { MfaCodeStep } from '@/components/mfa/MfaCodeStep'
import { MfaEnrollStep } from '@/components/mfa/MfaEnrollStep'

type Step =
  | { kind: 'password' }
  | { kind: 'enroll'; qrDataUrl: string; manualKey: string }
  | { kind: 'verify'; method: 'totp' | 'sms' | 'email' }

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
    if (body.ok) {
      router.push('/')
      router.refresh()
      return
    }
    if (body.mode === 'enroll') {
      setStep({ kind: 'enroll', qrDataUrl: body.qrDataUrl, manualKey: body.manualKey })
    } else {
      setStep({ kind: 'verify', method: body.mode as 'totp' | 'sms' | 'email' })
    }
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

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-muted/20 px-4 py-10 selection:bg-primary/20">
      {/* Background gradients for a modern, clinical feel */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[800px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <ClinsyncLogo className="text-3xl font-extrabold tracking-tight text-foreground" />
          <span className="mt-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Staff Portal
          </span>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
          {step.kind === 'password' && (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
                <p className="mt-2 text-sm text-muted-foreground">Sign in to your clinical-staff account.</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium leading-none">
                    Work Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@clinsync.health"
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium leading-none">
                      Password
                    </label>
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting || !email || !password}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-r-transparent" />
                      Authenticating...
                    </div>
                  ) : (
                    'Sign in to Clinsync'
                  )}
                </button>
              </form>
            </>
          )}
          
          {step.kind === 'enroll' && (
            <MfaEnrollStep qrDataUrl={step.qrDataUrl} manualKey={step.manualKey} onSubmit={submitMfaCode} />
          )}
          {step.kind === 'verify' && (
            <MfaCodeStep
              title={step.method === 'sms' ? 'Check your phone' : step.method === 'email' ? 'Check your email' : 'Enter your code'}
              description={
                step.method === 'sms' ? 'We texted a 6-digit code to your phone. Enter it below.'
                : step.method === 'email' ? 'We emailed a 6-digit code to you. Enter it below.'
                : 'Open your authenticator app and enter the current 6-digit code.'
              }
              onSubmit={submitMfaCode}
              onBack={() => setStep({ kind: 'password' })}
            />
          )}
        </div>
        
        {step.kind === 'password' && (
          <div className="mt-10">
            <div className="flex items-center justify-center gap-8 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> HIPAA Compliant</span>
              <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" /> Real-time Sync</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> RBAC Secured</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

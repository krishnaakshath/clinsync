'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardCheck, Receipt, Stethoscope, ClipboardList, Pill, TestTube2, ShieldCheck, HeartPulse, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { MfaCodeStep } from '@/components/mfa/MfaCodeStep'
import { MfaEnrollStep } from '@/components/mfa/MfaEnrollStep'

type Step =
  | { kind: 'password' }
  | { kind: 'enroll'; qrDataUrl: string; manualKey: string }
  | { kind: 'verify'; method: 'totp' | 'sms' | 'email' }

// Wayfinding only -- picking a tile does not grant a role. It just brands the
// form and points staff at the right door; the actual role always comes from
// the credentials, checked server-side in POST /api/login.
const PORTALS = [
  { key: 'frontdesk', label: 'Front Desk', description: 'Registration, check-in, and scheduling', icon: ClipboardCheck },
  { key: 'billing', label: 'Billing', description: 'Claims, collections, and statements', icon: Receipt },
  { key: 'pi', label: 'Doctor / PI', description: 'Patients, charts, and prescriptions', icon: Stethoscope },
  { key: 'crc', label: 'Coordinator', description: 'Screening, forms, and the workbook', icon: ClipboardList },
  { key: 'pharmacy', label: 'Pharmacy', description: 'Dispensing and medication stock', icon: Pill },
  { key: 'labs', label: 'Labs', description: 'Collections, results, and imaging', icon: TestTube2 },
  { key: 'admin', label: 'Admin', description: 'Practice-wide oversight and settings', icon: ShieldCheck },
] as const

export default function LoginPage() {
  const router = useRouter()
  const [portal, setPortal] = useState<(typeof PORTALS)[number] | null>(null)
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fafafa] px-4 py-10 selection:bg-primary/20">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 transform">
        <div className="h-[600px] w-[1000px] rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
      </div>

      {portal === null ? (
        <div className="relative z-10 w-full max-w-[560px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <ClinsyncLogo className="text-3xl font-extrabold tracking-tight text-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Choose your portal, then sign in with your staff credentials.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PORTALS.map(({ key, label, description, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPortal(PORTALS.find((p) => p.key === key)!)}
                className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-white p-4 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)] transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
              </button>
            ))}
            <Link
              href="/patient-portal/login"
              className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-white p-4 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)] transition-colors hover:border-primary/40 hover:bg-primary/[0.03] sm:col-span-2"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <HeartPulse className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">Patient Portal</span>
                <span className="block truncate text-xs text-muted-foreground">View your records, forms, and messages</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <ClinsyncLogo className="text-3xl font-extrabold tracking-tight text-foreground" />
        </div>

        <div className="rounded-3xl border border-border/50 bg-white p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
          {step.kind === 'password' && (
            <>
              <button
                type="button"
                onClick={() => setPortal(null)}
                className="mb-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                All portals
              </button>
              <div className="mb-8 text-center">
                <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <portal.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{portal.label}</h1>
                <p className="mt-2 text-sm text-muted-foreground">Sign in to your account.</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium leading-none">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium leading-none">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                    'Sign in'
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
      </div>
      )}
    </div>
  )
}

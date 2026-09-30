'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Users, Activity, FileText } from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { MfaCodeStep } from '@/components/mfa/MfaCodeStep'
import { MfaEnrollStep } from '@/components/mfa/MfaEnrollStep'

const HIGHLIGHTS = [
  { icon: Activity, text: 'Clinical intelligence & automated screening' },
  { icon: Users, text: 'Reconciled patient records across systems' },
  { icon: FileText, text: 'Streamlined front desk & billing workflows' },
  { icon: ShieldCheck, text: 'HIPAA compliant with built-in audit logging' },
]

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
    <div className="flex min-h-screen bg-background">
      {/* Brand Panel (Left Side) - Deep, premium gradient with subtle texture */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-[#0f172a] p-12 text-primary-foreground lg:flex">
        {/* Subtle dot pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10 mix-blend-overlay"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}
          aria-hidden="true"
        />
        
        {/* Soft glowing orb in the background */}
        <div className="pointer-events-none absolute -left-20 top-20 h-96 w-96 rounded-full bg-white/10 blur-[100px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-40 -right-20 h-[500px] w-[500px] rounded-full bg-black/20 blur-[120px]" aria-hidden="true" />

        <div className="relative z-10 flex items-center gap-3">
          <ClinsyncLogo className="text-xl font-bold tracking-tight text-white drop-shadow-sm" />
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">Staff Portal</span>
        </div>

        <div className="relative z-10 max-w-md space-y-10">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
            Clinical intelligence, unified in one platform.
          </h1>
          <ul className="space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-4">
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 shadow-inner backdrop-blur-md">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <span className="text-base font-medium leading-relaxed text-primary-foreground/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs font-medium text-primary-foreground/70">
          <p>© {new Date().getFullYear()} Clinsync Health</p>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <p>HIPAA Compliant</p>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <p>SOC2 Type II</p>
        </div>
      </div>

      {/* Form Panel (Right Side) - Clean, spacious, bright */}
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-6 lg:w-1/2 lg:px-20 xl:px-32">
        <div className="mx-auto w-full max-w-sm">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <ClinsyncLogo className="text-2xl font-bold tracking-tight text-foreground" />
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">Staff Portal</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to your clinical-staff account to continue.</p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8">
            {step.kind === 'password' && (
              <>
                {/* Dummy accounts box -- purely to help the reviewer click around the demo
                    roles without needing to dig through seed.ts. Remove this before prod. */}
                <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs">
                  <p className="mb-2 font-semibold text-primary">Demo accounts (pw: password)</p>
                  <ul className="grid grid-cols-2 gap-2 text-primary/80">
                    <li>admin@clinsync.health</li>
                    <li>crc@clinsync.health</li>
                    <li>pi@clinsync.health</li>
                    <li>frontdesk@clinsync.health</li>
                    <li>pharmacy@clinsync.health</li>
                    <li>billing@clinsync.health</li>
                  </ul>
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
                      placeholder="doctor@clinsync.health"
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
                    className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
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
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Having trouble signing in? <a href="#" className="font-medium text-primary hover:underline">Contact IT Support</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

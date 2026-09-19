'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Users, FlaskConical } from 'lucide-react'
import { IpmgIcon } from '@/components/IpmgLogo'

const HIGHLIGHTS = [
  { icon: FlaskConical, text: 'Automated inclusion/exclusion screening against live trial criteria' },
  { icon: Users, text: 'A single reconciled patient record across every source system' },
  { icon: ShieldCheck, text: 'Identity verification and audit logging built in' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Identity panel -- uses the same dark sidebar tokens as the app shell,
          so the login screen reads as part of the same product rather than
          a bare, unbranded form. */}
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
          <span className="text-lg font-semibold tracking-tight">Clinsync</span>
        </div>
        <div className="relative space-y-8">
          <h2 className="max-w-sm text-3xl font-bold leading-tight">Pre-screening, reconciled across every system, in one place.</h2>
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
        <p className="relative text-xs text-sidebar-foreground/50">Clinical-trial pre-screening workbook</p>
      </div>

      <div className="flex w-full flex-1 flex-col items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-1 lg:hidden">
            <div className="mb-3 flex items-center gap-2.5 text-foreground">
              <IpmgIcon className="h-6 w-auto" />
              <span className="text-lg font-semibold tracking-tight">Clinsync</span>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/10 bg-card p-7 shadow-md">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
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
          </div>
        </div>
      </div>
    </div>
  )
}

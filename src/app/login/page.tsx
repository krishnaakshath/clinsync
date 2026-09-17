'use client'
import { useRouter } from 'next/navigation'

const DEMO_USERS = [
  { role: 'crc', name: 'Jamie Ruiz (Research Coordinator)' },
  { role: 'pi', name: 'Dr. R. Kunam (Principal Investigator)' },
  { role: 'admin', name: 'Sam Patel (Admin / IT)' },
] as const

export default function LoginPage() {
  const router = useRouter()

  async function signIn(role: string, name: string) {
    const res = await fetch('/api/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name }),
    })
    if (!res.ok) return
    router.push('/patients')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <div className="mb-4 w-full max-w-sm rounded-md bg-amber-50 px-4 py-1 text-center text-xs font-semibold text-amber-800">
        PILOT / DEMO — NO REAL PATIENT DATA
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Clinsync — Demo Sign In</h1>
        <p className="mb-6 text-sm text-slate-500">Pilot demo only. Choose a role to explore the prototype.</p>
        <div className="space-y-2">
          {DEMO_USERS.map((u) => (
            <button key={u.role} onClick={() => signIn(u.role, u.name)} className="w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-secondary">
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

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
    router.push('/')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Clinsync — Sign In</h1>
        <p className="mb-6 text-sm text-muted-foreground">Choose a role to continue.</p>
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

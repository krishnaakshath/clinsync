import type { Session } from '@/lib/auth'

export function FrontDeskDashboard({ session }: { session: Session }) {
  return (
    <div>
      <div className="mb-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-foreground">Front Desk</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {session.name}.</p>
      </div>
    </div>
  )
}

function ConnectionDot({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-600' : 'bg-red-600'}`} aria-hidden="true" />
      <span>{label}</span> {connected ? 'Connected' : 'Disconnected'}
    </span>
  )
}

export function TopBanner({ environment, intakeqConnected, tebraConnected, userName }: { environment: 'pilot' | 'production'; intakeqConnected: boolean; tebraConnected: boolean; userName: string }) {
  return (
    <div className="border-b border-border bg-card">
      <div className="bg-amber-50 px-4 py-1 text-center text-xs font-semibold text-amber-800">
        {environment === 'pilot' ? 'PILOT / DEMO — NO REAL PATIENT DATA' : 'PRODUCTION'}
      </div>
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-5">
          <ConnectionDot label="IntakeQ" connected={intakeqConnected} />
          <ConnectionDot label="Tebra" connected={tebraConnected} />
        </div>
        <span className="text-sm font-medium text-foreground">{userName}</span>
      </div>
    </div>
  )
}

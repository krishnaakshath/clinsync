function ConnectionDot({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
      <span>{label}</span> {connected ? 'Connected' : 'Disconnected'}
    </span>
  )
}

export function TopBanner({ environment, intakeqConnected, tebraConnected, userName }: { environment: 'pilot' | 'production'; intakeqConnected: boolean; tebraConnected: boolean; userName: string }) {
  return (
    <div className="border-b bg-white">
      <div className="bg-amber-50 px-4 py-1 text-center text-xs font-semibold text-amber-800">
        {environment === 'pilot' ? 'PILOT / DEMO — NO REAL PATIENT DATA' : 'PRODUCTION'}
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          <ConnectionDot label="IntakeQ" connected={intakeqConnected} />
          <ConnectionDot label="Tebra" connected={tebraConnected} />
        </div>
        <span className="text-sm text-slate-600">{userName}</span>
      </div>
    </div>
  )
}

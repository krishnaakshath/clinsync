export function TopBanner({ environment, userName }: { environment: 'pilot' | 'production'; userName: string }) {
  return (
    <div className="border-b border-border bg-card">
      <div className="bg-amber-50 px-4 py-1 text-center text-xs font-semibold text-amber-800">
        {environment === 'pilot' ? 'PILOT / DEMO — NO REAL PATIENT DATA' : 'PRODUCTION'}
      </div>
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-base font-semibold tracking-tight text-foreground">Clinsync</span>
        <span className="text-sm font-medium text-foreground">{userName}</span>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'

export function RefreshEligibilityButton({ anonId }: { anonId: string }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    const res = await fetch(`/api/patients/${anonId}/refresh`, { method: 'POST' })
    if (!res.ok) { setRunning(false); setError('Could not refresh eligibility.'); return }
    // A full reload rather than router.refresh() -- this page's data comes
    // from a Redis-cached query (getPatientDetail), and the freshly
    // regenerated criteria only reliably show up on a real navigation, not
    // a soft RSC refresh, in local testing against this app's dev server.
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={running}
        className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {running ? 'Running eligibility check…' : 'Refresh from Source Systems'}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

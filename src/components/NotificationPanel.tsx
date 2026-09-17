'use client'
import { useState, useEffect } from 'react'

interface Event { id: number; action: string; timestamp: string }

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    if (open) {
      fetch('/api/audit-log?limit=10')
        .then((r) => r.json())
        .then((data) => setEvents((data.entries ?? []).slice(0, 10)))
    }
  }, [open])

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary" aria-label="Notifications">
        Notifications{events.length > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{events.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Activity</p>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records found.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-foreground">{e.action}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

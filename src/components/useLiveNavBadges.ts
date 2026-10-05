'use client'
import { useEffect, useState } from 'react'
import type { NavBadges } from '@/components/LeftNav'

export const NAV_BADGE_REFRESH_MS = 60_000

function isNavBadges(value: unknown): value is NavBadges {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
}

/** Live nav counts. Next layouts don't re-render on client navigation, so the
 *  server-computed `initial` badges would go stale; this keeps them as the
 *  initial state, then refreshes from /api/nav-badges every
 *  NAV_BADGE_REFRESH_MS while the tab is visible, and immediately when the
 *  window regains focus or the document becomes visible.
 *
 *  A failed refresh (network error, non-2xx, bad body) keeps the previous
 *  counts silently. Keys absent from a successful response also keep their
 *  previous value: the server omits a key when it couldn't compute it
 *  (getNavBadges fails safe to {}), and absence must never read as 0.
 *
 *  `initial === undefined` (no server badges) disables polling entirely. */
export function useLiveNavBadges(initial: NavBadges | undefined): NavBadges | undefined {
  const [badges, setBadges] = useState(initial)
  // Adopt a fresh server value when the layout re-renders (e.g. router.refresh()).
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setBadges(initial === undefined ? undefined : (prev) => ({ ...prev, ...initial }))
  }

  const enabled = initial !== undefined
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let inFlight = false
    const controller = new AbortController()

    async function refresh() {
      if (disposed || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const res = await fetch('/api/nav-badges', { cache: 'no-store', signal: controller.signal })
        if (!res.ok) return
        const body: unknown = await res.json()
        const next = (body as { badges?: unknown } | null)?.badges
        if (disposed || !isNavBadges(next)) return
        setBadges((prev) => ({ ...prev, ...next }))
      } catch {
        // Keep the previous counts; the next tick or focus will retry.
      } finally {
        inFlight = false
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void refresh()
    }
    function onFocus() { void refresh() }

    const interval = setInterval(() => { void refresh() }, NAV_BADGE_REFRESH_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      controller.abort()
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])

  return badges
}

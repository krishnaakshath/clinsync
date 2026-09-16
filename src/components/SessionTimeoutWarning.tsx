'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const WARN_AFTER_MS = 10 * 60 * 1000  // 10 min idle
const LOGOUT_AFTER_MS = 12 * 60 * 1000 // 12 min idle

export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let warnTimer: ReturnType<typeof setTimeout>
    let logoutTimer: ReturnType<typeof setTimeout>

    function reset() {
      clearTimeout(warnTimer)
      clearTimeout(logoutTimer)
      setShowWarning(false)
      warnTimer = setTimeout(() => setShowWarning(true), WARN_AFTER_MS)
      logoutTimer = setTimeout(() => {
        document.cookie = 'clinsync_demo_session=; Max-Age=0; path=/'
        router.push('/login')
      }, LOGOUT_AFTER_MS)
    }

    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    return () => {
      clearTimeout(warnTimer)
      clearTimeout(logoutTimer)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [router])

  if (!showWarning) return null

  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <p className="mb-2 font-semibold">You'll be signed out soon</p>
        <p className="mb-4 text-sm text-slate-600">For patient data protection, inactive sessions end automatically.</p>
        <button onClick={() => setShowWarning(false)} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
          Stay signed in
        </button>
      </div>
    </div>
  )
}

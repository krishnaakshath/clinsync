'use client'
import { useRouter } from 'next/navigation'
import { NotificationPanel } from '@/components/NotificationPanel'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'

export function TopBanner({ userName }: { userName: string }) {
  const router = useRouter()

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 text-primary">
          <ClinsyncLogo className="h-6 w-6" />
          <span className="text-base font-semibold tracking-tight text-foreground">Clinsync</span>
        </div>
        <div className="flex items-center gap-4">
          <NotificationPanel />
          <span className="text-sm font-medium text-foreground">{userName}</span>
          <button onClick={signOut} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useRouter } from 'next/navigation'
import { NotificationPanel } from '@/components/NotificationPanel'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { GlobalSearch } from '@/components/GlobalSearch'

export function TopBanner({ userName }: { userName: string }) {
  const router = useRouter()

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="border-b border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 text-sidebar-foreground">
          <ClinsyncLogo className="h-6 w-6" />
          <span className="text-base font-semibold tracking-tight">Clinsync</span>
        </div>
        <GlobalSearch />
        <div className="flex items-center gap-4">
          <NotificationPanel triggerClassName="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          <span className="text-sm font-medium text-sidebar-foreground">{userName}</span>
          <button onClick={signOut} className="text-sm font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

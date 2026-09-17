import { NotificationPanel } from '@/components/NotificationPanel'

export function TopBanner({ userName }: { userName: string }) {
  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-base font-semibold tracking-tight text-foreground">Clinsync</span>
        <div className="flex items-center gap-4">
          <NotificationPanel />
          <span className="text-sm font-medium text-foreground">{userName}</span>
        </div>
      </div>
    </div>
  )
}

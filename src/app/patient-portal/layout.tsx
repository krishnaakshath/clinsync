import { ClinsyncLogo } from '@/components/ClinsyncLogo'

export default function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-sidebar-border bg-sidebar px-6 py-3">
        <div className="flex items-center gap-2 text-sidebar-foreground" title="Clinsync Patient Portal">
          <ClinsyncLogo className="h-6 w-6" />
          <span className="text-base font-semibold tracking-tight">Clinsync Patient Portal</span>
        </div>
      </div>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  )
}

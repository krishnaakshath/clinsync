import { ClinsyncLogo } from '@/components/ClinsyncLogo'

export default function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Same dark-sidebar identity treatment as the staff app shell's
          TopBanner, so the patient-facing portal reads as part of the same
          product instead of a plain, unbranded strip. */}
      <div className="relative overflow-hidden border-b border-sidebar-border bg-sidebar px-6 py-4 shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '28px 28px' }}
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-4xl items-center gap-2.5 text-sidebar-foreground" title="Clinsync Patient Portal">
          <ClinsyncLogo className="h-6 w-6" />
          <span className="text-base font-semibold tracking-tight">Clinsync Patient Portal</span>
        </div>
      </div>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  )
}

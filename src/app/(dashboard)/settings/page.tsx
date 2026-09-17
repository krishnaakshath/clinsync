import { requireSessionOrRedirect } from '@/lib/auth'
import { getAppSettings } from '@/lib/queries/settings'
import { AutoClassifyToggle } from '@/components/AutoClassifyToggle'

export default async function SettingsPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  const settings = await getAppSettings()
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Settings</h1>
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance</h2>
        <p className="text-sm">BAA status: <span className="font-medium text-amber-800">Pending signature</span></p>
      </section>
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classification</h2>
        <AutoClassifyToggle initialEnabled={settings.autoClassifyOnComplete} isAdmin={session.role === 'admin'} />
      </section>
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</h2>
        <p className="text-sm">{session.name} ({session.role})</p>
      </section>
    </div>
  )
}

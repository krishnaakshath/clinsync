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
      <section className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classification</h2>
        <AutoClassifyToggle initialEnabled={settings.autoClassifyOnComplete} isAdmin={session.role === 'admin'} />
      </section>
      <section className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</h2>
        <p className="text-sm">{session.name} ({session.role})</p>
      </section>
    </div>
  )
}

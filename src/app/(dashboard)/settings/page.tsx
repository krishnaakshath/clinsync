import { Building2, Plug, SlidersHorizontal, UserCircle2, Users } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { getSettingsSummary } from '@/lib/queries/settings'
import { listAllProviders } from '@/lib/queries/providers'
import { ROLE_CAPABILITIES } from '@/lib/role-capabilities'
import { AutoClassifyToggle } from '@/components/AutoClassifyToggle'
import { PracticeInfoForm } from '@/components/PracticeInfoForm'
import { EhrConnectionsForm } from '@/components/EhrConnectionsForm'
import { ProviderProfilesPanel } from '@/components/settings/ProviderProfilesPanel'
import { Tabs } from '@/components/Tabs'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'

const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', pi: 'Principal Investigator', crc: 'Clinical Research Coordinator' }

export default async function SettingsPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  const settings = await getSettingsSummary()
  const providers = await listAllProviders()
  const isAdmin = session.role === 'admin'
  const capabilities = ROLE_CAPABILITIES[session.role]

  const practiceTab = (
    <section className={SECTION}>
      <PracticeInfoForm initial={{ practiceName: settings.practiceName, practiceSite: settings.practiceSite, practiceTimezone: settings.practiceTimezone }} isAdmin={isAdmin} />
    </section>
  )

  const ehrTab = (
    <section className={SECTION}>
      <EhrConnectionsForm initial={{ intakeqConfigured: settings.intakeqConfigured, tebraConfigured: settings.tebraConfigured }} isAdmin={isAdmin} />
    </section>
  )

  const classificationTab = (
    <section className={SECTION}>
      <AutoClassifyToggle initialEnabled={settings.autoClassifyOnComplete} isAdmin={isAdmin} />
    </section>
  )

  const providersTab = (
    <section className={SECTION}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider roster</h2>
      <ProviderProfilesPanel providers={providers} isAdmin={isAdmin} />
    </section>
  )

  const accountTab = (
    <div className="space-y-4">
      <section className={SECTION}>
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
            <UserCircle2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{session.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[session.role] ?? session.role}</p>
          </div>
        </div>
      </section>
      <section className={SECTION}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What you can do</h2>
        <p className="mb-3 text-sm text-foreground">{capabilities.summary}</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {capabilities.bullets.map((b, i) => <li key={i}>• {b}</li>)}
        </ul>
      </section>
    </div>
  )

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Settings</h1>
      <Tabs tabs={[
        { id: 'practice', label: <><Building2 className="h-4 w-4" aria-hidden="true" />Practice</>, content: practiceTab },
        { id: 'ehr', label: <><Plug className="h-4 w-4" aria-hidden="true" />EHR Connections</>, content: ehrTab },
        { id: 'classification', label: <><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Classification</>, content: classificationTab },
        { id: 'providers', label: <><Users className="h-4 w-4" aria-hidden="true" />Providers</>, content: providersTab },
        { id: 'account', label: <><UserCircle2 className="h-4 w-4" aria-hidden="true" />Account</>, content: accountTab },
      ]} />
    </div>
  )
}

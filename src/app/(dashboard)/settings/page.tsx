import { requireSessionOrRedirect } from '@/lib/auth'
import { getSettingsSummary } from '@/lib/queries/settings'
import { AutoClassifyToggle } from '@/components/AutoClassifyToggle'
import { PracticeInfoForm } from '@/components/PracticeInfoForm'
import { EhrConnectionsForm } from '@/components/EhrConnectionsForm'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
const SECTION_HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function SettingsPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  const settings = await getSettingsSummary()
  const isAdmin = session.role === 'admin'
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Settings</h1>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Practice information</h2>
        <PracticeInfoForm initial={{ practiceName: settings.practiceName, practiceSite: settings.practiceSite, practiceTimezone: settings.practiceTimezone }} isAdmin={isAdmin} />
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>EHR connections</h2>
        <EhrConnectionsForm initial={{ intakeqConfigured: settings.intakeqConfigured, tebraConfigured: settings.tebraConfigured }} isAdmin={isAdmin} />
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Classification</h2>
        <AutoClassifyToggle initialEnabled={settings.autoClassifyOnComplete} isAdmin={isAdmin} />
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Signed in as</h2>
        <p className="text-sm">{session.name} ({session.role})</p>
      </section>
    </div>
  )
}

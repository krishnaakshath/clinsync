import { notFound } from 'next/navigation'
import { FlaskConical, CheckCircle2, XCircle } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { listAllTrials } from '@/lib/queries/trials'
import { Tabs } from '@/components/Tabs'
import { BackLink } from '@/components/BackLink'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
const HEADING = 'mb-2 border-l-2 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function TrialDetailPage({ params }: { params: Promise<{ trialId: string }> }) {
  // Must be the first statement — see the comment in patients/page.tsx.
  await requireSessionOrRedirect()

  const { trialId } = await params
  const trials = await listAllTrials()
  const trial = trials.find((t) => t.id === trialId)
  if (!trial) notFound()

  const requiredStableMeds = trial.medicationClasses.filter((m) => m.ruleType === 'required_stable')
  const washoutMeds = trial.medicationClasses.filter((m) => m.ruleType === 'washout_exclusion')

  const inclusionTab = (
    <div className="space-y-4">
      <section className={SECTION}>
        <h3 className={`${HEADING} border-emerald-500/50`}>Age range</h3>
        <p className="text-sm text-foreground">{trial.ageMin}–{trial.ageMax} years old</p>
      </section>
      <section className={SECTION}>
        <h3 className={`${HEADING} border-emerald-500/50`}>Diagnosis codes</h3>
        <ul className="space-y-1.5 text-sm text-foreground">
          {trial.diagnosisCodes.map((d) => <li key={d.code}>{d.code} — {d.description}</li>)}
        </ul>
      </section>
      <section className={SECTION}>
        <h3 className={`${HEADING} border-emerald-500/50`}>Rating scale(s)</h3>
        <ul className="space-y-1.5 text-sm text-foreground">
          {trial.ratingScales.map((r) => <li key={r.name}>{r.name} — {r.description}</li>)}
        </ul>
        {trial.minRatingScaleScore != null && (
          <p className="mt-2 text-xs text-muted-foreground">Minimum qualifying score: {trial.minRatingScaleScore}</p>
        )}
      </section>
      {requiredStableMeds.length > 0 && (
        <section className={SECTION}>
          <h3 className={`${HEADING} border-emerald-500/50`}>Required stable medication</h3>
          <ul className="space-y-1.5 text-sm text-foreground">
            {requiredStableMeds.map((m) => <li key={m.className}>{m.className} — {m.rule} (≥{m.washoutDays} days)</li>)}
          </ul>
        </section>
      )}
    </div>
  )

  const exclusionTab = (
    <div className="space-y-4">
      <section className={SECTION}>
        <h3 className={`${HEADING} border-red-500/50`}>Excluded medication classes</h3>
        {washoutMeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">None configured.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground">
            {washoutMeds.map((m) => <li key={m.className}>{m.className} — {m.rule} ({m.washoutDays}-day washout)</li>)}
          </ul>
        )}
      </section>
      <section className={SECTION}>
        <h3 className={`${HEADING} border-red-500/50`}>Disqualifying diagnoses</h3>
        {trial.exclusionDiagnoses.length === 0 ? (
          <p className="text-sm text-muted-foreground">None configured.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground">
            {trial.exclusionDiagnoses.map((d) => <li key={d.code}>{d.code} — {d.description}</li>)}
          </ul>
        )}
      </section>
    </div>
  )

  return (
    <div className="max-w-2xl space-y-6">
      <BackLink href="/trials" label="Back to Trials" />
      <div className={`${SECTION} flex items-center gap-4`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <FlaskConical className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-foreground">{trial.name}</h1>
          <p className="text-xs text-muted-foreground">{trial.nctNumber} · {trial.site} · {trial.studyDrug}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{trial.ageMin}–{trial.ageMax}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Age range</p>
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-emerald-700">{trial.diagnosisCodes.length + requiredStableMeds.length + (trial.minRatingScaleScore != null ? 1 : 0)} inclusion rules</p>
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
          <XCircle className="h-4 w-4 text-red-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-red-700">{washoutMeds.length + trial.exclusionDiagnoses.length} exclusion rules</p>
        </div>
      </div>

      <Tabs tabs={[
        { id: 'inclusion', label: <><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />Inclusion criteria</>, content: inclusionTab },
        { id: 'exclusion', label: <><XCircle className="h-4 w-4 text-red-700" aria-hidden="true" />Exclusion criteria</>, content: exclusionTab },
      ]} />
    </div>
  )
}

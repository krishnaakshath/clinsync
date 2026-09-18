import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { listAllTrials } from '@/lib/queries/trials'

export default async function TrialDetailPage({ params }: { params: Promise<{ trialId: string }> }) {
  // Must be the first statement — see the comment in patients/page.tsx.
  await requireSessionOrRedirect()

  const { trialId } = await params
  const trials = await listAllTrials()
  const trial = trials.find((t) => t.id === trialId)
  if (!trial) notFound()

  const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
  const HEADING = 'mb-2 border-l-2 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{trial.name}</h1>
      <p className="text-sm text-muted-foreground">Age {trial.ageMin}–{trial.ageMax} · {trial.nctNumber} · {trial.site}</p>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-700">Inclusion criteria</h2>
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
          {trial.medicationClasses.some((m) => m.ruleType === 'required_stable') && (
            <section className={SECTION}>
              <h3 className={`${HEADING} border-emerald-500/50`}>Required stable medication</h3>
              <ul className="space-y-1.5 text-sm text-foreground">
                {trial.medicationClasses.filter((m) => m.ruleType === 'required_stable').map((m) => <li key={m.className}>{m.className} — {m.rule} (≥{m.washoutDays} days)</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-red-700">Exclusion criteria</h2>
        <div className="space-y-4">
          <section className={SECTION}>
            <h3 className={`${HEADING} border-red-500/50`}>Excluded medication classes</h3>
            {trial.medicationClasses.filter((m) => m.ruleType === 'washout_exclusion').length === 0 ? (
              <p className="text-sm text-muted-foreground">None configured.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-foreground">
                {trial.medicationClasses.filter((m) => m.ruleType === 'washout_exclusion').map((m) => <li key={m.className}>{m.className} — {m.rule} ({m.washoutDays}-day washout)</li>)}
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
      </div>
    </div>
  )
}

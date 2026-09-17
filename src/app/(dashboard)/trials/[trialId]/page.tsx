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

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{trial.name}</h1>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnosis Codes</h2>
        <ul className="space-y-1.5 text-sm text-foreground">
          {trial.diagnosisCodes.map((d) => <li key={d.code}>{d.code} — {d.description}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rating Scale(s)</h2>
        <ul className="space-y-1.5 text-sm text-foreground">
          {trial.ratingScales.map((r) => <li key={r.name}>{r.name} — {r.description}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medication Class Rules</h2>
        <ul className="space-y-1.5 text-sm text-foreground">
          {trial.medicationClasses.map((m) => <li key={m.className}>{m.className} — {m.rule} ({m.washoutDays} days)</li>)}
        </ul>
      </section>
    </div>
  )
}

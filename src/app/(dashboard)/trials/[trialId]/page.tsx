import { notFound } from 'next/navigation'
import { listAllTrials } from '@/lib/queries/trials'

export default async function TrialDetailPage({ params }: { params: Promise<{ trialId: string }> }) {
  const { trialId } = await params
  const trials = await listAllTrials()
  const trial = trials.find((t) => t.id === trialId)
  if (!trial) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold">{trial.name}</h1>
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">Diagnosis Codes</h2>
        <ul className="list-inside list-disc text-sm">
          {trial.diagnosisCodes.map((d) => <li key={d.code}>{d.code} — {d.description}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">Rating Scale(s)</h2>
        <ul className="list-inside list-disc text-sm">
          {trial.ratingScales.map((r) => <li key={r.name}>{r.name} — {r.description}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">Medication Class Rules</h2>
        <ul className="list-inside list-disc text-sm">
          {trial.medicationClasses.map((m) => <li key={m.className}>{m.className} — {m.rule} ({m.washoutDays} days)</li>)}
        </ul>
      </section>
    </div>
  )
}

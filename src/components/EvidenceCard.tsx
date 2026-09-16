import { StatusChip } from './StatusChip'

export function EvidenceCard({ criterion }: { criterion: { criterionText: string; verdict: 'green' | 'yellow' | 'red'; evidenceQuote: string | null; evidenceSourceDoc: string | null; evidenceSourceDate: string | null } }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{criterion.criterionText}</span>
        <StatusChip status={criterion.verdict} />
      </div>
      <blockquote className="rounded bg-slate-50 p-3 font-mono text-xs text-slate-700">
        {criterion.evidenceQuote ?? 'No evidence available — defaults to Needs Verification.'}
      </blockquote>
      <p className="mt-1 text-xs text-slate-400">{criterion.evidenceSourceDoc} · {criterion.evidenceSourceDate}</p>
    </div>
  )
}

import { StatusChip } from './StatusChip'

export function EvidenceCard({ criterion }: { criterion: { criterionText: string; verdict: 'green' | 'yellow' | 'red'; evidenceQuote: string | null; evidenceSourceDoc: string | null; evidenceSourceDate: string | null } }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{criterion.criterionText}</span>
        <StatusChip status={criterion.verdict} />
      </div>
      <blockquote className="rounded-md border-l-4 border-primary bg-secondary p-3 font-mono text-xs leading-relaxed text-foreground">
        {criterion.evidenceQuote ?? 'No evidence available — defaults to Needs Verification.'}
      </blockquote>
      <p className="mt-2 text-xs text-muted-foreground">{criterion.evidenceSourceDoc} · {criterion.evidenceSourceDate}</p>
    </div>
  )
}

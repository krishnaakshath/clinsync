import { Lock } from 'lucide-react'

const COLORS: Record<string, string> = {
  system: 'bg-slate-100 text-slate-700',
  intakeq: 'bg-blue-100 text-blue-700',
  tebra: 'bg-purple-100 text-purple-700',
  staff: 'bg-emerald-100 text-emerald-700',
}

// Per spec §6: every IntakeQ/Tebra-sourced field carries a read-only lock
// indicator; only "staff" fields are ever editable.
export function SourceTag({ source }: { source: 'system' | 'intakeq' | 'tebra' | 'staff' }) {
  const readOnly = source !== 'staff'
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${COLORS[source]}`}>
      {readOnly && <Lock className="h-2.5 w-2.5" aria-label="read-only" />}
      {source}
    </span>
  )
}

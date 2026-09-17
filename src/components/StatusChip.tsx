import type { Verdict } from '@/lib/rule-engine'

// Matches the real Tebra/IntakeQ convention observed directly in the
// product: status is a colored dot + plain text label, never an icon
// glyph. The dot is decorative (aria-hidden) -- the text label alone
// satisfies "never color alone" on its own.
const CONFIG: Record<Verdict, { label: string; dotClassName: string; textClassName: string }> = {
  green: { label: 'Meets', dotClassName: 'bg-emerald-600', textClassName: 'text-emerald-800' },
  yellow: { label: 'Needs Verification', dotClassName: 'bg-amber-500', textClassName: 'text-amber-800' },
  red: { label: 'Potential Exclusion', dotClassName: 'bg-red-600', textClassName: 'text-red-800' },
}

export function StatusChip({ status }: { status: Verdict }) {
  const { label, dotClassName, textClassName } = CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${textClassName}`}>
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
      {label}
    </span>
  )
}

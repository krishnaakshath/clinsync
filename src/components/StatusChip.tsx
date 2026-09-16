import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { Verdict } from '@/lib/rule-engine'

const CONFIG: Record<Verdict, { label: string; icon: typeof CheckCircle2; className: string }> = {
  green: { label: 'Meets', icon: CheckCircle2, className: 'bg-green-100 text-green-800 border-green-300' },
  yellow: { label: 'Needs Verification', icon: AlertTriangle, className: 'bg-amber-100 text-amber-800 border-amber-300' },
  red: { label: 'Potential Exclusion', icon: XCircle, className: 'bg-red-100 text-red-800 border-red-300' },
}

export function StatusChip({ status }: { status: Verdict }) {
  const { label, icon: Icon, className } = CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}

import { Stethoscope } from 'lucide-react'

export function ClinsyncLogo({ className = 'h-6 w-6' }: { className?: string }) {
  return <Stethoscope className={className} strokeWidth={2} aria-hidden="true" />
}

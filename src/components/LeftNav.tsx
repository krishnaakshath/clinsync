import Link from 'next/link'

const ITEMS = [
  { href: '/patients', label: 'Patients' },
  { href: '/identity-matching', label: 'Identity Matching' },
  { href: '/trials', label: 'Trials & Protocols' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/settings', label: 'Settings' },
]

export function LeftNav() {
  return (
    <nav className="w-56 shrink-0 border-r bg-slate-50 p-4">
      <ul className="space-y-1">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

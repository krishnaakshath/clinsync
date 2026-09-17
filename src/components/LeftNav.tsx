'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/patients', label: 'Patients' },
  { href: '/identity-matching', label: 'Identity Matching' },
  { href: '/trials', label: 'Trials & Protocols' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/settings', label: 'Settings' },
]

export function LeftNav() {
  const pathname = usePathname()
  return (
    <nav className="w-56 shrink-0 bg-sidebar p-4">
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

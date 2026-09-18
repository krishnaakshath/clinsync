'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/patients', label: 'Patients' },
  { href: '/identity-matching', label: 'Identity Matching' },
  { href: '/trials', label: 'Trials & Protocols' },
  { href: '/forms', label: 'Form Templates' },
  { href: '/client-forms', label: 'Client Forms' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/experience-surveys', label: 'Experience Surveys' },
  { href: '/pipeline-dashboard', label: 'Pipeline Dashboard' },
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
                aria-current={active ? 'page' : undefined}
                className={`block rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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

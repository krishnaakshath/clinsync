'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@/lib/auth'

const ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/doctor', label: 'My Patients', roles: ['pi'] as Role[] },
  { href: '/patients', label: 'Patients' },
  { href: '/workbook', label: 'Workbook' },
  { href: '/identity-matching', label: 'Identity Matching' },
  { href: '/trials', label: 'Trials & Protocols' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/forms', label: 'Form Templates' },
  { href: '/client-forms', label: 'Client Forms' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/build-status', label: 'Build Progress' },
  { href: '/settings', label: 'Settings' },
]

export function LeftNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  return (
    <nav className="w-56 shrink-0 bg-sidebar p-4">
      <ul className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent text-sidebar-foreground/80 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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

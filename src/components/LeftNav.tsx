'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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
]

const BILLING_ITEMS = [
  { href: '/billing/charges', label: 'Charges' },
  { href: '/billing/insurance-collections', label: 'Insurance Collections' },
  { href: '/billing/patient-collections', label: 'Patient Collections' },
  { href: '/billing/statements', label: 'Statements' },
  { href: '/billing/ar-dashboard', label: 'A/R Dashboard' },
  { href: '/billing/analytics', label: 'Analytics' },
  { href: '/billing/pay', label: 'Virtual Card Payment (Demo)' },
]

const TRAILING_ITEMS = [
  { href: '/reports', label: 'Reports' },
  { href: '/documents', label: 'Documents' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/experience-surveys', label: 'Experience Surveys' },
  { href: '/pipeline-dashboard', label: 'Pipeline Dashboard' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/build-status', label: 'Build Progress' },
  { href: '/settings', label: 'Settings' },
]

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
          : 'border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      }`}
    >
      {label}
    </Link>
  )
}

export function LeftNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const billingActive = pathname?.startsWith('/billing') ?? false
  const [billingOpen, setBillingOpen] = useState(billingActive)

  return (
    <nav className="w-56 shrink-0 bg-sidebar p-4">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} active={isActive(pathname, item.href)} />
          </li>
        ))}

        <li>
          <button
            type="button"
            onClick={() => setBillingOpen((v) => !v)}
            aria-expanded={billingOpen}
            className={`flex w-full items-center justify-between rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
              billingActive
                ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
                : 'border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            Billing
            <span aria-hidden="true">{billingOpen ? '−' : '+'}</span>
          </button>
          {billingOpen && (
            <ul className="mt-1 space-y-1 ps-3">
              {BILLING_ITEMS.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          )}
        </li>

        {TRAILING_ITEMS.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

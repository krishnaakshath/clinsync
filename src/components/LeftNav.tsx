'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Stethoscope, Users, ClipboardList, Fingerprint, FlaskConical,
  Calendar, FileText, FileSignature, MessageSquare, Wallet, Receipt, ShieldCheck, HandCoins,
  FileBarChart, TrendingUp, BarChart3, CreditCard, FileBarChart2, FolderOpen,
  Megaphone, Star, Activity, Settings, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { Role } from '@/lib/auth'
import { IpmgIcon } from '@/components/IpmgLogo'

type Icon = React.ComponentType<{ className?: string }>

// Role-scoped navigation: a Principal Investigator's job here is making
// clinical eligibility calls, not running practice operations, so they get
// a trimmed, clinical-only nav (Home/My Patients/Patients/Trials/Calendar/
// Client Forms/Messages, plus their own Account tab in Settings) -- no
// Workbook, Identity Matching, Form Templates (building/editing form
// structures is a coordinator/admin task), Billing, or the Operations
// group (Reports/Documents/Broadcasts/Experience Surveys/Pipeline
// Dashboard), which are the coordinator's and admin's tools. Client Forms
// stays visible to PI -- reviewing a patient's actual submitted answers is
// clinical review, not practice administration. Admin and CRC both keep
// full operational access -- see src/lib/role-capabilities.ts, which this
// must stay consistent with.
const ITEMS: { href: string; label: string; icon: Icon; roles?: Role[] }[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/doctor', label: 'My Patients', icon: Stethoscope, roles: ['pi'] as Role[] },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/workbook', label: 'Workbook', icon: ClipboardList, roles: ['admin', 'crc'] as Role[] },
  { href: '/identity-matching', label: 'Identity Matching', icon: Fingerprint, roles: ['admin', 'crc'] as Role[] },
  { href: '/trials', label: 'Trials & Protocols', icon: FlaskConical },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/forms', label: 'Form Templates', icon: FileText, roles: ['admin', 'crc'] as Role[] },
  { href: '/client-forms', label: 'Client Forms', icon: FileSignature },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
]

const BILLING_ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/billing/charges', label: 'Charges', icon: Receipt },
  { href: '/billing/insurance-collections', label: 'Insurance Collections', icon: ShieldCheck },
  { href: '/billing/patient-collections', label: 'Patient Collections', icon: HandCoins },
  { href: '/billing/statements', label: 'Statements', icon: FileBarChart },
  { href: '/billing/ar-dashboard', label: 'A/R Dashboard', icon: TrendingUp },
  { href: '/billing/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/billing/pay', label: 'Virtual Card Payment (Demo)', icon: CreditCard },
]

const TRAILING_ITEMS: { href: string; label: string; icon: Icon; roles?: Role[] }[] = [
  { href: '/reports', label: 'Reports', icon: FileBarChart2, roles: ['admin', 'crc'] as Role[] },
  { href: '/documents', label: 'Documents', icon: FolderOpen, roles: ['admin', 'crc'] as Role[] },
  { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone, roles: ['admin', 'crc'] as Role[] },
  { href: '/experience-surveys', label: 'Experience Surveys', icon: Star, roles: ['admin', 'crc'] as Role[] },
  { href: '/pipeline-dashboard', label: 'Pipeline Dashboard', icon: Activity, roles: ['admin', 'crc'] as Role[] },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 first:mt-0">{children}</p>
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
          : 'border-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export function LeftNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const trailingItems = TRAILING_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const showBilling = role === 'admin' || role === 'crc'
  const billingActive = pathname?.startsWith('/billing') ?? false
  const [billingOpen, setBillingOpen] = useState(billingActive)

  return (
    <nav className="w-60 shrink-0 overflow-y-auto bg-sidebar p-3">
      <div className="mb-1 flex items-center rounded-lg bg-white/95 px-2.5 py-2">
        <IpmgIcon className="h-5 w-auto" />
      </div>
      <p className="mb-4 px-2.5 text-[11px] font-medium text-sidebar-foreground/50">Clinsync</p>
      <GroupLabel>Workspace</GroupLabel>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>

      {showBilling && (
        <>
          <GroupLabel>Billing</GroupLabel>
          <button
            type="button"
            onClick={() => setBillingOpen((v) => !v)}
            aria-expanded={billingOpen}
            className={`flex w-full items-center gap-2.5 rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
              billingActive
                ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
                : 'border-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Billing</span>
            {billingOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          </button>
          {billingOpen && (
            <ul className="mt-0.5 space-y-0.5 ps-3">
              {BILLING_ITEMS.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <GroupLabel>Operations</GroupLabel>
      <ul className="space-y-0.5">
        {trailingItems.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

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

type Icon = React.ComponentType<{ className?: string }>

const ITEMS: { href: string; label: string; icon: Icon; roles?: Role[] }[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/doctor', label: 'My Patients', icon: Stethoscope, roles: ['pi'] as Role[] },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/workbook', label: 'Workbook', icon: ClipboardList },
  { href: '/identity-matching', label: 'Identity Matching', icon: Fingerprint },
  { href: '/trials', label: 'Trials & Protocols', icon: FlaskConical },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/forms', label: 'Form Templates', icon: FileText },
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

const TRAILING_ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/reports', label: 'Reports', icon: FileBarChart2 },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { href: '/experience-surveys', label: 'Experience Surveys', icon: Star },
  { href: '/pipeline-dashboard', label: 'Pipeline Dashboard', icon: Activity },
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
  const billingActive = pathname?.startsWith('/billing') ?? false
  const [billingOpen, setBillingOpen] = useState(billingActive)

  return (
    <nav className="w-60 shrink-0 overflow-y-auto bg-sidebar p-3">
      <GroupLabel>Workspace</GroupLabel>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>

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

      <GroupLabel>Operations</GroupLabel>
      <ul className="space-y-0.5">
        {TRAILING_ITEMS.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Stethoscope, Users, ClipboardList, FlaskConical,
  Calendar, FileText, FileSignature, MessageSquare, Wallet, Receipt, ShieldCheck, HandCoins,
  FileBarChart, TrendingUp, BarChart3, CreditCard, FileBarChart2, FolderOpen,
  Megaphone, Star, Activity, Settings, ChevronDown, ChevronRight, History,
  ClipboardCheck, ListChecks, BedDouble, Pill, TestTube2, IdCard, CalendarClock, Search,
  Syringe, DollarSign,
} from 'lucide-react'
import type { Role } from '@/lib/auth'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'

type Icon = React.ComponentType<{ className?: string }>

// Role-scoped navigation. Each role sees only the routes relevant to their
// job. This list is the source of truth that nav-role-enforcement tests
// derive server-side gate assertions from: a restricted entry here without
// a matching PAGE_GATES row will fail that suite.
//
// Per RBAC spec:
//  frontdesk  — check-in, assignments, beds, booking; NO billing, NO labs, NO messages, NO trials, NO staff
//  billing    — billing section only; NO clinical routes whatsoever
//  pharmacy   — pharmacy routes only; NO patients page, NO messages, NO labs, NO staff
//  pi/doctor  — clinical workflow: My Patients, Patients, Calendar, Client Forms, Labs; NO billing
//  crc/admin  — full operational access

export const NAV_ITEMS: { href: string; label: string; icon: Icon; roles?: Role[] }[] = [
  // Visible to all roles that reach a dashboard
  { href: '/', label: 'Home', icon: LayoutDashboard },

  // Doctor / PI — clinical workflow
  { href: '/doctor', label: 'My Patients', icon: Stethoscope, roles: ['pi'] as Role[] },

  // Patient list — clinical roles only (not billing, not pharmacy)
  { href: '/patients', label: 'Patients', icon: Users, roles: ['crc', 'pi', 'admin', 'frontdesk'] as Role[] },

  // Admin/CRC/PI operational tools
  { href: '/workbook', label: 'Workbook', icon: ClipboardList, roles: ['admin', 'crc', 'pi'] as Role[] },

  // Trials & Protocols — clinical only
  { href: '/trials', label: 'Trials & Protocols', icon: FlaskConical, roles: ['crc', 'pi', 'admin'] as Role[] },

  // Calendar — clinical scheduling
  { href: '/calendar', label: 'Calendar', icon: Calendar, roles: ['crc', 'pi', 'admin', 'frontdesk'] as Role[] },

  // Form Templates — admin/crc/pi
  { href: '/forms', label: 'Form Templates', icon: FileText, roles: ['admin', 'crc', 'pi'] as Role[] },

  // Client Forms — clinical review (NOT billing, NOT pharmacy)
  { href: '/client-forms', label: 'Client Forms', icon: FileSignature, roles: ['crc', 'pi', 'admin'] as Role[] },

  // Front Desk specific flows
  { href: '/front-desk/check-in', label: 'Check-In', icon: ClipboardCheck, roles: ['frontdesk', 'admin', 'crc'] as Role[] },
  { href: '/front-desk/assignments', label: 'Assignments', icon: ListChecks, roles: ['frontdesk', 'admin', 'crc'] as Role[] },
  { href: '/inpatient/beds', label: 'Beds / Wards', icon: BedDouble, roles: ['frontdesk', 'admin', 'crc', 'pi'] as Role[] },

  // Pharmacy — dedicated section; no full patient record access
  { href: '/pharmacy', label: 'Pharmacy', icon: Pill, roles: ['crc', 'pi', 'admin', 'pharmacy'] as Role[] },
  { href: '/pharmacy/patient-lookup', label: 'Patient Lookup', icon: Search, roles: ['pharmacy', 'admin'] as Role[] },

  // Labs — clinical roles only (NOT frontdesk, NOT billing, NOT pharmacy)
  { href: '/labs', label: 'Labs', icon: TestTube2, roles: ['admin', 'crc', 'pi'] as Role[] },

  // Staff directory — admin/crc only (NOT frontdesk, NOT billing, NOT pharmacy)
  { href: '/staff', label: 'Staff', icon: IdCard, roles: ['crc', 'admin'] as Role[] },

  // Booking requests — frontdesk / admin / crc
  { href: '/booking-requests', label: 'Booking Requests', icon: CalendarClock, roles: ['frontdesk', 'admin', 'crc', 'pi'] as Role[] },

  // Messages — clinical comms (NOT billing, NOT frontdesk)
  { href: '/messages', label: 'Messages', icon: MessageSquare, roles: ['crc', 'pi', 'admin'] as Role[] },
]

export const NAV_BILLING_ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/billing/ar-dashboard', label: 'A/R Dashboard', icon: TrendingUp },
  { href: '/billing/charges', label: 'Charges', icon: Receipt },
  { href: '/billing/insurance-collections', label: 'Insurance Collections', icon: ShieldCheck },
  { href: '/billing/patient-collections', label: 'Patient Collections', icon: HandCoins },
  { href: '/billing/statements', label: 'Statements', icon: FileBarChart },
  { href: '/billing/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/billing/pay', label: 'Virtual Card Payment (Demo)', icon: CreditCard },
]

export const NAV_TRAILING_ITEMS: { href: string; label: string; icon: Icon; roles?: Role[] }[] = [
  { href: '/reports', label: 'Reports', icon: FileBarChart2, roles: ['admin', 'crc'] as Role[] },
  { href: '/documents', label: 'Documents', icon: FolderOpen, roles: ['admin', 'crc'] as Role[] },
  { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone, roles: ['admin', 'crc'] as Role[] },
  { href: '/experience-surveys', label: 'Experience Surveys', icon: Star, roles: ['admin', 'crc'] as Role[] },
  { href: '/pipeline-dashboard', label: 'Pipeline Dashboard', icon: Activity, roles: ['admin', 'crc'] as Role[] },
  { href: '/audit-log', label: 'Audit Log', icon: History, roles: ['admin'] as Role[] },
  // Settings: NOT visible to billing role
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'crc', 'pi', 'frontdesk', 'pharmacy'] as Role[] },
]

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 first:mt-2">
      {children}
    </p>
  )
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export const BILLING_ROLES: Role[] = ['admin', 'crc', 'billing']

export function LeftNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const trailingItems = NAV_TRAILING_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const showBilling = BILLING_ROLES.includes(role)
  const billingActive = pathname?.startsWith('/billing') ?? false
  const [billingOpen, setBillingOpen] = useState(billingActive || role === 'billing')

  // Billing-only nav: only show the billing section, nothing else clinical
  const isBillingOnly = role === 'billing'

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
      {/* Logo / Wordmark */}
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <ClinsyncLogo className="text-base font-bold tracking-tight text-foreground" />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!isBillingOnly && (
          <>
            <GroupLabel>Navigation</GroupLabel>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          </>
        )}

        {showBilling && (
          <>
            <GroupLabel>Billing</GroupLabel>
            {!isBillingOnly && (
              <button
                type="button"
                onClick={() => setBillingOpen((v) => !v)}
                aria-expanded={billingOpen}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  billingActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">Billing</span>
                {billingOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              </button>
            )}
            {(billingOpen || isBillingOnly) && (
              <ul className={`mt-0.5 space-y-0.5 ${!isBillingOnly ? 'ps-3' : ''}`}>
                {NAV_BILLING_ITEMS.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!isBillingOnly && trailingItems.length > 0 && (
          <>
            <GroupLabel>Operations</GroupLabel>
            <ul className="space-y-0.5">
              {trailingItems.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Role badge at bottom */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">{role}</p>
      </div>
    </nav>
  )
}

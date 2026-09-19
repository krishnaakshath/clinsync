'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Pill, CalendarCheck, MessageSquare } from 'lucide-react'
import { IpmgIcon } from '@/components/IpmgLogo'

type Icon = React.ComponentType<{ className?: string }>

const ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/patient-portal', label: 'Overview', icon: LayoutDashboard },
  { href: '/patient-portal/forms', label: 'Forms', icon: FileText },
  { href: '/patient-portal/medications', label: 'Medications', icon: Pill },
  { href: '/patient-portal/appointments', label: 'Appointments', icon: CalendarCheck },
  { href: '/patient-portal/messages', label: 'Messages', icon: MessageSquare },
]

function isActive(pathname: string | null, href: string): boolean {
  if (href === '/patient-portal') return pathname === href
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}

// Same visual language as the staff app's LeftNav -- a persistent, icon+
// label sidebar with the logo pinned to the top -- so the patient-facing
// portal reads as the same product instead of a separately-designed one.
export function PatientPortalSideNav() {
  const pathname = usePathname()

  return (
    <nav className="w-60 shrink-0 overflow-y-auto bg-sidebar p-3">
      <div className="mb-1 flex items-center rounded-lg bg-white/95 px-2.5 py-2">
        <IpmgIcon className="h-5 w-auto" />
      </div>
      <p className="mb-4 px-2.5 text-[11px] font-medium text-sidebar-foreground/50">Clinsync</p>
      <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Patient Portal</p>
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-md border-l-2 py-2 pe-3 ps-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'border-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

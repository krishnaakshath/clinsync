import { ArrowRight, HeartPulse } from 'lucide-react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'
import { STAFF_PORTALS } from '@/lib/staff-portals'
import { PortalTileLink } from '@/components/PortalTileLink'
import Aurora from '@/components/Aurora'

// Picking a tile navigates to that role's own /login/[role] URL (a real,
// separate, shareable/bookmarkable page) -- it never grants a role itself.
// The real role always comes from the credentials, resolved server-side in
// POST /api/login, which every /login/[role] page calls identically via the
// shared StaffLoginForm.
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fafafa] px-4 py-10 selection:bg-primary/20">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] opacity-[0.35]">
        <Aurora colorStops={['#3d4f8f', '#c98a4b', '#3d4f8f']} amplitude={0.6} blend={0.4} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 transform">
        <div className="h-[600px] w-[1000px] rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-3xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <ClinsyncLogo className="text-3xl font-extrabold tracking-tight text-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Choose your portal, then sign in with your staff credentials.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {STAFF_PORTALS.map(({ key, label, description, icon: Icon, iconBg, iconText }) => (
            <PortalTileLink
              key={key}
              href={`/login/${key}`}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-white p-6 text-center shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.12)]"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg} ${iconText}`}>
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Sign in to</span>
                <span className="mt-0.5 block text-base font-bold text-foreground">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
              </span>
            </PortalTileLink>
          ))}
          <PortalTileLink
            href="/patient-portal/login"
            spotlightColor="rgba(201, 138, 75, 0.14)"
            className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-white p-6 text-center shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.12)]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <HeartPulse className="h-6 w-6" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Sign in to</span>
              <span className="mt-0.5 block text-base font-bold text-foreground">Patient Portal</span>
              <span className="mt-1 block text-xs text-muted-foreground">Records, forms, and messages</span>
            </span>
          </PortalTileLink>
        </div>
        <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span>Every portal is the same secure sign-in</span>
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
          <span>your role is determined by your credentials</span>
        </div>
      </div>
    </div>
  )
}

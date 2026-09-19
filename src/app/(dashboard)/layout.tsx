import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TopBanner } from '@/components/TopBanner'
import { LeftNav } from '@/components/LeftNav'
import { SessionTimeoutWarning } from '@/components/SessionTimeoutWarning'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    // h-screen + overflow-hidden (not min-h-screen) is deliberate: without a
    // height BOUND on this wrapper, "overflow-auto" below has nothing to
    // scroll within, so a tall page just grows the whole document and the
    // browser scrolls the entire window -- carrying the sidebar and top bar
    // away with it instead of leaving them pinned while only the page
    // content scrolls.
    <div className="flex h-screen flex-col overflow-hidden">
      <SessionTimeoutWarning />
      <TopBanner userName={session.name} />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav role={session.role} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TopBanner } from '@/components/TopBanner'
import { LeftNav } from '@/components/LeftNav'
import { SessionTimeoutWarning } from '@/components/SessionTimeoutWarning'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen flex-col">
      <SessionTimeoutWarning />
      <TopBanner userName={session.name} />
      <div className="flex flex-1">
        <LeftNav role={session.role} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}

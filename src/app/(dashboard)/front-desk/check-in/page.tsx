import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listActiveProviders } from '@/lib/queries/providers'
import { listAvailableRooms } from '@/lib/queries/rooms'
import { CheckInButton } from '@/components/CheckInButton'

// Gives admin and crc (who have no dashboard button for this -- their home
// dashboards are AdminDashboard/CoordinatorDashboard, neither of which
// renders CheckInButton) a real entry point at the URL LeftNav already
// promises them, instead of a 404. frontdesk lands here too, matching the
// nav link's role list.
export default async function FrontDeskCheckInPage() {
  const session = await requireSessionOrRedirect()
  if (!['frontdesk', 'admin', 'crc'].includes(session.role)) redirect('/')

  const [providers, rooms] = await Promise.all([listActiveProviders(), listAvailableRooms()])
  await logAudit(session, 'viewed front desk check-in', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Check-In</h1>
      <CheckInButton providers={providers} rooms={rooms} />
    </div>
  )
}

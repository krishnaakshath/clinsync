import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listStaffMembers } from '@/lib/queries/staff-members'
import { listExpiringOrExpiredCredentials } from '@/lib/queries/staff-credentials'
import { listAllUsers } from '@/lib/queries/users'
import { listActiveProviders } from '@/lib/queries/providers'
import { StaffDirectoryList } from '@/components/StaffDirectoryList'

export default async function StaffPage() {
  // Must be the first statement -- see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  // Matches LeftNav's roles for this route -- previously nav-hidden only,
  // with no actual server-side check, so a role the nav hides this from
  // (e.g. pi, frontdesk) could still reach the staff directory by URL.
  if (!['crc', 'admin'].includes(session.role)) redirect('/')

  const [staffMembers, expiringCredentials, users, providers] = await Promise.all([
    listStaffMembers(),
    listExpiringOrExpiredCredentials(),
    listAllUsers(),
    listActiveProviders(),
  ])
  await logAudit(session, 'viewed staff directory', null)

  return (
    <StaffDirectoryList
      staffMembers={staffMembers}
      expiringCredentials={expiringCredentials}
      users={users}
      providers={providers}
      canWrite={session.role === 'admin'}
    />
  )
}

import type { Session } from '@/lib/auth'
import type { NavBadges } from '@/components/LeftNav'
import { resolveDoctorQueueProvider } from '@/lib/doctor-queue-provider'
import { countPendingAssignmentsForProvider, countUnacknowledgedDeclines } from '@/lib/queries/doctor-assignments'

const DECLINE_BADGE_ROLES: Session['role'][] = ['frontdesk', 'admin', 'crc']

/** Count pills for the dashboard LeftNav, keyed by nav href. A doctor whose
 *  session resolves to no provider gets no /doctor key at all, so the badge
 *  is suppressed rather than shown as a misleading 0 (the /doctor page shows
 *  the explicit "couldn't match" warning instead). Roles with no badge run
 *  no query. */
export async function getNavBadges(session: Session): Promise<NavBadges> {
  if (session.role === 'pi') {
    const provider = await resolveDoctorQueueProvider(session)
    if (!provider) return {}
    return { '/doctor': await countPendingAssignmentsForProvider(provider.id) }
  }
  if (DECLINE_BADGE_ROLES.includes(session.role)) {
    return { '/front-desk/assignments': await countUnacknowledgedDeclines() }
  }
  return {}
}

import type { Session } from '@/lib/auth'
import { resolveSessionProvider } from '@/lib/provider-identity'
import { listActiveProviders } from '@/lib/queries/providers'

/** Resolves which provider's assignment queue a doctor (pi) session sees.
 *  Returns the real users -> staffMembers -> providers link when there is
 *  one; otherwise falls back to the first active provider whose name
 *  contains the session's last name (case-insensitive). This fuzzy fallback
 *  is the deliberate fail-open choice that provider-identity.ts says
 *  belongs at the call site. Returns null when neither matches, and callers
 *  must show that as "unknown", never as an empty queue. */
export async function resolveDoctorQueueProvider(session: Session): Promise<{ id: number; name: string } | null> {
  const resolved = await resolveSessionProvider(session)
  if (resolved) return resolved
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const match = (await listActiveProviders()).find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  return match ?? null
}

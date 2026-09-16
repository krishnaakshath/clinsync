import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Shared by the /api/identity-matches route handler and the Identity Matching
 * Queue Server Component page — see the comment on `listPatientsWithStatus`
 * in `src/lib/queries/patients.ts` for why Server Components must call this
 * directly rather than fetching the app's own API route.
 */
export async function listPendingIdentityMatches() {
  return getDb().select().from(identityMatches).where(eq(identityMatches.status, 'pending'))
}

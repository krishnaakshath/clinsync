import { getDb } from '@/db/client'
import { staffMembers, staffCredentials, users, providers } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'

export interface CreateStaffMemberInput {
  userId: number | null
  providerId: number | null
  name: string
  department: string
  title: string
  employmentStatus?: 'active' | 'on_leave' | 'terminated'
  hireDate: string
  terminationDate?: string | null
}

export type CreateStaffMemberResult =
  | { ok: true; staffMember: typeof staffMembers.$inferSelect }
  | { ok: false; error: string }

export async function listStaffMembers() {
  return getDb().select().from(staffMembers).orderBy(asc(staffMembers.name))
}

export async function getStaffMemberDetail(id: number) {
  const [staffMember] = await getDb().select().from(staffMembers).where(eq(staffMembers.id, id))
  if (!staffMember) return null
  const credentials = await getDb().select().from(staffCredentials).where(eq(staffCredentials.staffMemberId, id))
  return { ...staffMember, credentials }
}

// Verifies userId/providerId reference real rows before insert (Review
// Focus #1) -- a dangling FK here would otherwise either throw an unhandled
// Postgres constraint error, or (if the columns were made nullable-without-
// checking) silently store a reference to nothing.
export async function createStaffMember(input: CreateStaffMemberInput): Promise<CreateStaffMemberResult> {
  const db = getDb()
  if (input.userId !== null) {
    const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId))
    if (!userRow) return { ok: false, error: 'userId does not reference an existing user' }
  }
  if (input.providerId !== null) {
    const [providerRow] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, input.providerId))
    if (!providerRow) return { ok: false, error: 'providerId does not reference an existing provider' }
  }

  const [staffMember] = await db.insert(staffMembers).values({
    userId: input.userId,
    providerId: input.providerId,
    name: input.name,
    department: input.department,
    title: input.title,
    employmentStatus: input.employmentStatus ?? 'active',
    hireDate: input.hireDate,
    terminationDate: input.terminationDate ?? null,
  }).returning()

  return { ok: true, staffMember }
}

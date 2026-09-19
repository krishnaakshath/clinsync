import { randomInt } from 'crypto'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/lib/password'
import type { Role } from '@/lib/auth'

export async function findUserByEmail(email: string) {
  const [row] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase()))
  return row ?? null
}

/** Settings > Staff panel roster -- never returns passwordHash. */
export async function listAllUsers() {
  return getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
}

const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateStaffPassword(): string {
  const chars = Array.from({ length: 12 }, () => UNAMBIGUOUS_CHARS[randomInt(UNAMBIGUOUS_CHARS.length)])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

/**
 * Admin-only: provisions a new staff login and returns the plaintext
 * password once, same pattern as issuing a patient portal password -- it's
 * never stored or retrievable in plaintext again, only its hash.
 * Returns null if the email is already in use (case-insensitive, matching
 * findUserByEmail's lookup).
 */
export async function createUser(input: { name: string; email: string; role: Role }): Promise<{ user: typeof users.$inferSelect; password: string } | null> {
  const existing = await findUserByEmail(input.email)
  if (existing) return null

  const password = generateStaffPassword()
  const [user] = await getDb().insert(users).values({
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    passwordHash: hashPassword(password),
  }).returning()

  return { user, password }
}

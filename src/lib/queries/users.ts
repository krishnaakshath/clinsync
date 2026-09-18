import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function findUserByEmail(email: string) {
  const [row] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase()))
  return row ?? null
}

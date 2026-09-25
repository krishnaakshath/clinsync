import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDb } from '@/db/client'
import { users, appSettings } from '@/db/schema'
import { resetUserMfa } from '@/lib/queries/users'
import { getAppSettings, resetAdminMfa } from '@/lib/queries/settings'

const methodSchema = z.object({
  method: z.enum(['totp', 'sms', 'email']),
  phone: z.string().min(1).optional(),
}).strict()

// Switches the CALLING session's own account only -- there's no target
// email/userId in the payload, exactly the same self-service scoping
// discipline as POST /api/account/mfa/reset (the resolved identity is
// always the session's own, never client-supplied).
export async function PUT(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = methodSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  const { method, phone } = parsed.data

  const adminEmail = process.env.ADMIN_EMAIL
  const isAdmin = session.role === 'admin' && adminEmail && session.name === (process.env.ADMIN_NAME ?? 'Admin')

  if (isAdmin) {
    const current = await getAppSettings()
    if (method === 'sms' && !phone && !current.adminPhone) {
      return NextResponse.json({ error: 'A phone number is required to switch to SMS sign-in.' }, { status: 400 })
    }
    await resetAdminMfa()
    await getDb().update(appSettings).set({ adminMfaMethod: method, ...(phone ? { adminPhone: phone } : {}) }).where(eq(appSettings.id, current.id))
    await logAudit(session, `switched MFA method to ${method}`, null)
    return NextResponse.json({ ok: true })
  }

  // session.name is a display name, not an email, for DB users -- resolve
  // the account by matching name+role instead (same best-effort convention
  // already used for doctor/provider matching elsewhere in this codebase,
  // acceptable here since this route only ever mutates the CALLER's own row
  // scoped by their own session, not an arbitrary target).
  const [row] = await getDb().select().from(users).where(eq(users.name, session.name))
  if (!row || row.role !== session.role) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  if (method === 'sms' && !phone && !row.phone) {
    return NextResponse.json({ error: 'A phone number is required to switch to SMS sign-in.' }, { status: 400 })
  }

  await resetUserMfa(row.id)
  await getDb().update(users).set({ mfaMethod: method, ...(phone ? { phone } : {}) }).where(eq(users.id, row.id))
  await logAudit(session, `switched MFA method to ${method}`, null)
  return NextResponse.json({ ok: true })
}

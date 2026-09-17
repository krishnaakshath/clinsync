import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setSessionCookie } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
}).strict()

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload' }, { status: 400 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH
  const adminName = process.env.ADMIN_NAME ?? 'Admin'
  if (!adminEmail || !adminPasswordHash) {
    return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 })
  }

  const { email, password } = parsed.data
  // Only the single provisioned admin account can sign in right now -- this
  // pilot deliberately has no self-service account creation yet, so there is
  // no user table to look up. Same generic error for a wrong email as for a
  // wrong password, so this endpoint never confirms which part was wrong.
  const emailMatches = email.toLowerCase() === adminEmail.toLowerCase()
  const passwordMatches = verifyPassword(password, adminPasswordHash)
  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  await setSessionCookie('admin', adminName)
  return NextResponse.json({ ok: true })
}

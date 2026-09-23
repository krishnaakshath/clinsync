import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Role } from '@/lib/auth'
import { encryptSensitive } from '@/lib/crypto'
import { generateMfaEnrollment } from '@/lib/mfa'
import { setPendingStaffMfaCookie } from '@/lib/mfa-pending-session'
import { verifyPassword } from '@/lib/password'
import { checkLoginRateLimit } from '@/lib/rate-limit'
import { getAdminMfaState, setAdminMfaSecret } from '@/lib/queries/settings'
import { findUserByEmail, getUserMfaState, setUserMfaSecret } from '@/lib/queries/users'

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
}).strict()

// Vercel/most proxies set the client IP as the first entry in
// x-forwarded-for; NextRequest no longer exposes `.ip` directly.
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

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

  const { email, password } = parsed.data

  const { allowed } = await checkLoginRateLimit(getClientIp(request), email)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Try again in a minute.' }, { status: 429 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH
  const adminName = process.env.ADMIN_NAME ?? 'Admin'

  // The one real admin account still authenticates via env vars, not a DB
  // row -- checked first so its behavior is byte-for-byte unchanged. Any
  // other provisioned account (pi/crc) authenticates against users.passwordHash.
  // Same generic error for a wrong email, a wrong password, or an account
  // with no password set at all, so this endpoint never confirms which
  // part was wrong or whether an email exists in the system.
  if (adminEmail && adminPasswordHash && email.toLowerCase() === adminEmail.toLowerCase() && verifyPassword(password, adminPasswordHash)) {
    return startStaffMfaChallenge({ role: 'admin', name: adminName, userId: null })
  }

  const user = await findUserByEmail(email)
  if (user?.passwordHash && verifyPassword(password, user.passwordHash)) {
    return startStaffMfaChallenge({ role: user.role, name: user.name, userId: user.id })
  }

  return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
}

// MFA is mandatory for every staff account, so a correct password never
// completes a login by itself anymore -- it always hands back an MFA
// challenge (enroll, the first time; verify, every time after).
async function startStaffMfaChallenge({ role, name, userId }: { role: Role; name: string; userId: number | null }) {
  const mfaState = userId === null ? await getAdminMfaState() : await getUserMfaState(userId)
  if (!mfaState || !mfaState.mfaEnabled) {
    const enrollment = await generateMfaEnrollment(`${name} <${role}>`)
    if (userId === null) await setAdminMfaSecret(encryptSensitive(enrollment.secretBase32))
    else await setUserMfaSecret(userId, encryptSensitive(enrollment.secretBase32))
    await setPendingStaffMfaCookie({ role, name, mode: 'enroll', userId })
    return NextResponse.json({ mfaRequired: true, mode: 'enroll', qrDataUrl: enrollment.qrDataUrl, manualKey: enrollment.secretBase32 })
  }
  await setPendingStaffMfaCookie({ role, name, mode: 'verify', userId })
  return NextResponse.json({ mfaRequired: true, mode: 'verify' })
}

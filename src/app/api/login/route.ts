import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Role } from '@/lib/auth'
import { isStaffRole, setSessionCookie } from '@/lib/auth'
import { encryptSensitive } from '@/lib/crypto'
import { generateMfaEnrollment } from '@/lib/mfa'
import { setPendingStaffMfaCookie } from '@/lib/mfa-pending-session'
import { verifyPassword } from '@/lib/password'
import { checkLoginRateLimit } from '@/lib/rate-limit'
import { getAdminMfaState, setAdminMfaSecret } from '@/lib/queries/settings'
import { findUserByEmail, getUserMfaState, setUserMfaSecret } from '@/lib/queries/users'
import { logAudit } from '@/lib/audit'

// Demo/eval toggle: set DISABLE_STAFF_MFA=true in the environment to skip
// the TOTP enroll/verify challenge entirely and complete login on password
// alone. Ported from the hims-platform lineage, which built this first --
// all the MFA code below is untouched and fully wired; flipping this back
// to unset (or "false") re-enables mandatory MFA with no other changes needed.
const staffMfaDisabled = process.env.DISABLE_STAFF_MFA === 'true'

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
    if (staffMfaDisabled) return completeLoginWithoutMfa('admin', adminName)
    return startStaffMfaChallenge({ role: 'admin', name: adminName, userId: null })
  }

  const user = await findUserByEmail(email)
  // A row whose role this app doesn't support (see isStaffRole) gets the
  // same generic 401 -- minting a session/MFA cookie for it would "succeed"
  // and then bounce the user straight back to /login.
  if (user?.passwordHash && isStaffRole(user.role) && verifyPassword(password, user.passwordHash)) {
    if (staffMfaDisabled) return completeLoginWithoutMfa(user.role, user.name)
    return startStaffMfaChallenge({ role: user.role, name: user.name, userId: user.id })
  }

  return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
}

// Mirrors /api/login/mfa's own success path (setSessionCookie + logAudit +
// {ok:true}) so a DISABLE_STAFF_MFA login is indistinguishable downstream
// from a real completed-MFA login -- same cookie shape, same audit trail.
async function completeLoginWithoutMfa(role: Role, name: string) {
  await setSessionCookie(role, name)
  await logAudit({ role, name }, 'completed login (MFA disabled)', null)
  return NextResponse.json({ ok: true })
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

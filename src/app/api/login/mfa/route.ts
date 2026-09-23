import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setSessionCookie } from '@/lib/auth'
import { decryptSensitive } from '@/lib/crypto'
import { verifyMfaCode } from '@/lib/mfa'
import { getPendingStaffMfaSession, clearPendingStaffMfaCookie } from '@/lib/mfa-pending-session'
import { getAdminMfaState, enableAdminMfa } from '@/lib/queries/settings'
import { getUserMfaState, enableUserMfa } from '@/lib/queries/users'
import { checkStaffMfaRateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict()

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const pending = await getPendingStaffMfaSession()
  if (!pending) return NextResponse.json({ error: 'Your login session expired. Please sign in again.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = mfaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

  const identity = pending.userId === null ? 'admin' : `user:${pending.userId}`
  const { allowed } = await checkStaffMfaRateLimit(getClientIp(request), identity)
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 })

  const mfaState = pending.userId === null ? await getAdminMfaState() : await getUserMfaState(pending.userId)
  if (!mfaState?.mfaSecretEncrypted) return NextResponse.json({ error: 'Your login session expired. Please sign in again.' }, { status: 401 })

  const secretBase32 = decryptSensitive(mfaState.mfaSecretEncrypted)
  if (!verifyMfaCode(secretBase32, parsed.data.code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  if (pending.mode === 'enroll') {
    if (pending.userId === null) await enableAdminMfa()
    else await enableUserMfa(pending.userId)
  }

  await clearPendingStaffMfaCookie()
  await setSessionCookie(pending.role, pending.name)
  await logAudit({ role: pending.role, name: pending.name }, pending.mode === 'enroll' ? 'enrolled in MFA and completed login' : 'completed MFA login', null)

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setPatientSessionCookie } from '@/lib/patient-session'
import { verifyPatientPortalCredentials } from '@/lib/queries/patient-portal'
import { checkPatientLoginRateLimit } from '@/lib/rate-limit'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'
import { setPendingPatientMfaCookie } from '@/lib/mfa-pending-session'
import { getPatientMfaState } from '@/lib/queries/patient-portal'

const loginSchema = z.object({
  patientId: z.string().trim().min(1),
  password: z.string().min(1),
}).strict()

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
  const { patientId, password } = parsed.data

  const { allowed } = await checkPatientLoginRateLimit(getClientIp(request), patientId)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Try again in a minute.' }, { status: 429 })
  }

  // Same generic error whether the patient ID doesn't exist, has no portal
  // access provisioned yet, or the password is wrong -- this endpoint never
  // confirms which part was wrong or whether a given patient ID is real.
  const valid = await verifyPatientPortalCredentials(patientId, password)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid patient ID or password' }, { status: 401 })
  }

  const mfaState = await getPatientMfaState(patientId)
  if (mfaState?.mfaEnabled) {
    await setPendingPatientMfaCookie({ patientId })
    return NextResponse.json({ mfaRequired: true })
  }

  await setPatientSessionCookie(patientId)
  await logPatientPortalAction('logged in to patient portal', patientId)
  return NextResponse.json({ ok: true })
}

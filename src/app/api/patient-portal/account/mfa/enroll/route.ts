import { NextResponse } from 'next/server'
import { requirePatientSession } from '@/lib/patient-session'
import { encryptSensitive } from '@/lib/crypto'
import { generateMfaEnrollment } from '@/lib/mfa'
import { getPatientMfaState, setPatientMfaSecret } from '@/lib/queries/patient-portal'

export async function POST() {
  const session = await requirePatientSession()
  if (session instanceof NextResponse) return session

  const mfaState = await getPatientMfaState(session.patientId)
  if (mfaState?.mfaEnabled) return NextResponse.json({ error: 'MFA is already enabled' }, { status: 400 })

  const enrollment = await generateMfaEnrollment(session.patientId)
  await setPatientMfaSecret(session.patientId, encryptSensitive(enrollment.secretBase32))

  return NextResponse.json({ qrDataUrl: enrollment.qrDataUrl, manualKey: enrollment.secretBase32 })
}

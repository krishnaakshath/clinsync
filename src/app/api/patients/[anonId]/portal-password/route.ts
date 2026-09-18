import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { setPatientPortalPassword, revokePatientPortalAccess } from '@/lib/queries/patient-portal'

// A memorable-but-random word-number credential (e.g. "harbor-4821") rather
// than a dense random string -- this is read aloud or handed to a patient
// on paper at checkout, not pasted from a password manager.
const WORDS = ['harbor', 'meadow', 'summit', 'willow', 'canyon', 'lantern', 'juniper', 'ember', 'cascade', 'orchard']

function generatePortalPassword(): string {
  const word = WORDS[randomInt(WORDS.length)]
  const digits = randomInt(1000, 10000)
  return `${word}-${digits}`
}

// Admin-only: generates a new hospital-issued portal password for this
// patient and returns it once in plaintext so staff can hand it to the
// patient directly (in person, by phone, or on a printed after-visit
// summary) -- it is never stored or retrievable in plaintext again, only
// its hash, matching how the staff admin credential works.
export async function POST(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const { anonId } = await params
  const password = generatePortalPassword()
  await setPatientPortalPassword(anonId, password)
  await logAudit(session, 'issued a new patient portal password', anonId)

  return NextResponse.json({ patientId: anonId, password })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const { anonId } = await params
  await revokePatientPortalAccess(anonId)
  await logAudit(session, 'revoked patient portal access', anonId)

  return NextResponse.json({ ok: true })
}

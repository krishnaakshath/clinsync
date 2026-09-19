import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { setPatientPortalPassword, revokePatientPortalAccess } from '@/lib/queries/patient-portal'

// Explicit product decision for the pilot: every patient portal account
// uses this same fixed password rather than a per-patient randomly
// generated one, for demo convenience. Deliberately weaker than random
// generation (a shared, guessable-alongside-sequential-patient-IDs
// credential) -- acceptable for local/dev demoing, never for a deployment
// that could hold real patient data, so it's hard-gated to non-production:
// NODE_ENV === 'production' always falls back to the original per-patient
// CSPRNG generator below, regardless of this constant.
const FIXED_PORTAL_PASSWORD = 'Pressword@69420'

// Handed to a patient on paper or read aloud at checkout, not pasted from a
// password manager -- so it needs to be transcribable without ambiguity,
// but it's still a real PHI-guarding credential and needs real entropy.
// This charset excludes visually-ambiguous characters (0/O, 1/I/L) and
// draws 12 characters from a 31-symbol alphabet: ~5 bits/char x 12 = ~59
// bits. Only reachable in production (see generatePortalPassword below).
const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateRandomPortalPassword(): string {
  const chars = Array.from({ length: 12 }, () => UNAMBIGUOUS_CHARS[randomInt(UNAMBIGUOUS_CHARS.length)])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

function generatePortalPassword(): string {
  return process.env.NODE_ENV === 'production' ? generateRandomPortalPassword() : FIXED_PORTAL_PASSWORD
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

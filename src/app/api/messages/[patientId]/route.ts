import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, type Session } from '@/lib/auth'
import { getPatientSession, type PatientSession } from '@/lib/patient-session'
import { logAudit } from '@/lib/audit'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'
import {
  listMessagesForPatient,
  sendMessage,
  markReadByProvider,
  markReadByPatient,
  getPatientDisplayName,
} from '@/lib/queries/messages'

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
}).strict()

type Actor = { kind: 'staff'; session: Session } | { kind: 'patient'; session: PatientSession }

/**
 * This route serves two completely separate session types (see AGENTS.md /
 * the auth-model notes in lib/auth.ts and lib/patient-session.ts) -- a staff
 * member reading/replying to any patient's thread, or a patient reading/
 * replying to their own. Deliberately checks staff first: a browser could
 * in theory carry both cookies (a staff member testing the patient portal
 * in the same browser), and staff access is the more privileged, more
 * common case for this route.
 *
 * A patient session may ONLY ever act on its own patientId's thread -- this
 * is the one hard boundary this route exists to enforce, since the two
 * session types must never be treated as interchangeable.
 */
async function resolveActor(patientId: string): Promise<Actor | NextResponse> {
  const staffSession = await getSession()
  if (staffSession) return { kind: 'staff', session: staffSession }

  const patientSession = await getPatientSession()
  if (patientSession) {
    if (patientSession.patientId !== patientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return { kind: 'patient', session: patientSession }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const actor = await resolveActor(patientId)
  if (actor instanceof NextResponse) return actor

  const thread = await listMessagesForPatient(patientId)

  if (actor.kind === 'staff') {
    await markReadByProvider(patientId)
    await logAudit(actor.session, 'viewed patient messages', patientId)
  } else {
    await markReadByPatient(patientId)
    await logPatientPortalAction('viewed messages', patientId)
  }

  return NextResponse.json(thread)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const actor = await resolveActor(patientId)
  if (actor instanceof NextResponse) return actor

  const parsed = sendMessageSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid message payload', details: parsed.error.flatten() }, { status: 400 })

  if (actor.kind === 'staff') {
    const created = await sendMessage(patientId, 'provider', actor.session.name, parsed.data.body)
    await logAudit(actor.session, 'sent patient message', patientId)
    return NextResponse.json(created, { status: 201 })
  }

  const patientName = await getPatientDisplayName(patientId)
  if (!patientName) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const created = await sendMessage(patientId, 'patient', patientName, parsed.data.body)
  await logPatientPortalAction('sent message', patientId)
  return NextResponse.json(created, { status: 201 })
}

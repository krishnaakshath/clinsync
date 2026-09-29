import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession, type Session } from '@/lib/auth'
import { listActiveProviders } from '@/lib/queries/providers'
import { getSessionById, markProviderJoined, type TelemedicineSessionRow } from '@/lib/queries/telemedicine-sessions'
import { createSignal, listSignalsSince } from '@/lib/queries/telemedicine-signals'

const signalSchema = z.object({
  signalType: z.enum(['offer', 'answer', 'ice_candidate']),
  payload: z.unknown(),
}).strict()

/**
 * Resolves the telemedicine session for `sessionId` and enforces the same
 * provider-ownership rule as inpatient/admissions/[id]/discharge/route.ts:
 * role-gated to admin/pi, and for pi specifically, the session name's last
 * word must match a real active provider who is the session's own provider.
 * Returns a ready NextResponse on any failure so both POST and GET can
 * short-circuit with `if ('response' in result) return result.response`.
 */
async function resolveOwnedSession(session: Session, sessionId: number): Promise<{ telemedicineSession: TelemedicineSessionRow } | { response: NextResponse }> {
  if (!['admin', 'pi'].includes(session.role)) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const telemedicineSession = await getSessionById(sessionId)
  if (!telemedicineSession) return { response: NextResponse.json({ error: 'Session not found' }, { status: 404 }) }

  if (session.role === 'pi') {
    const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
    const providersList = await listActiveProviders()
    const providerMatch = providersList.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
    if (!providerMatch || telemedicineSession.appointmentProviderId !== providerMatch.id) {
      return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
  }

  return { telemedicineSession }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { sessionId } = await params
  const id = Number(sessionId)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })

  const resolved = await resolveOwnedSession(session, id)
  if ('response' in resolved) return resolved.response

  const parsed = signalSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid signal payload', details: parsed.error.flatten() }, { status: 400 })

  const created = await createSignal(id, 'provider', parsed.data.signalType, parsed.data.payload)
  return NextResponse.json({ id: created.id }, { status: 201 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { sessionId } = await params
  const id = Number(sessionId)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })

  const resolved = await resolveOwnedSession(session, id)
  if ('response' in resolved) return resolved.response

  const url = new URL(request.url)
  const forParam = url.searchParams.get('for')
  if (forParam !== 'patient') return NextResponse.json({ error: "Query param 'for' must be 'patient'" }, { status: 400 })
  const since = Number(url.searchParams.get('since')) || 0

  // Idempotent, called on every poll -- spec §3: "transitions scheduled ->
  // waiting on first poll." Re-fetch status after so a first-ever poll
  // reports 'waiting', not the stale 'scheduled' read before the update.
  await markProviderJoined(id)
  const telemedicineSession = await getSessionById(id)

  const signals = await listSignalsSince(id, since, 'patient')
  return NextResponse.json({ signals, sessionStatus: telemedicineSession!.status })
}

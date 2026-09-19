import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { rejectCrossOrigin } from '@/lib/csrf'
import { confirmIdentityMatch } from '@/lib/ehr-sync'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfRejection = rejectCrossOrigin(request)
  if (csrfRejection) return csrfRejection

  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  // Confirming doesn't just flip the queue row's status -- it pulls both
  // systems' data for the matched pair and creates the actual patient chart,
  // which is the entire point of running the match in the first place.
  const result = await confirmIdentityMatch(Number(id))
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await logAudit(session, `confirmed identity match ${id}`, result.patientId)

  // The Identity Matching Queue submits this as a real HTML <form>, so a
  // browser navigates to whatever this returns — a bare JSON response left
  // the coordinator stranded on a raw JSON blob instead of back at the
  // queue. A caller that explicitly wants JSON (e.g. a test, or a future
  // fetch()-based UI) can ask for it via the Accept header.
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ status: 'confirmed', patientId: result.patientId })
  }
  return NextResponse.redirect(new URL('/identity-matching', request.url), 303)
}

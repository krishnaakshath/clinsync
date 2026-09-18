import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { rejectCrossOrigin } from '@/lib/csrf'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfRejection = rejectCrossOrigin(request)
  if (csrfRejection) return csrfRejection

  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const [updated] = await getDb().update(identityMatches).set({ status: 'confirmed' }).where(eq(identityMatches.id, Number(id))).returning()
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await logAudit(session, `confirmed identity match ${id}`, null)

  // The Identity Matching Queue submits this as a real HTML <form>, so a
  // browser navigates to whatever this returns — a bare JSON response left
  // the coordinator stranded on a raw JSON blob instead of back at the
  // queue. A caller that explicitly wants JSON (e.g. a test, or a future
  // fetch()-based UI) can ask for it via the Accept header.
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ status: updated.status })
  }
  return NextResponse.redirect(new URL('/identity-matching', request.url), 303)
}

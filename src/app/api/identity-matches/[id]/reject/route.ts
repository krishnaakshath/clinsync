import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'

// The system never auto-selects a candidate — Reject is a first-class action,
// not an afterthought.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const [updated] = await getDb().update(identityMatches).set({ status: 'rejected' }).where(eq(identityMatches.id, Number(id))).returning()
  await logAudit(session, `rejected identity match candidate ${id}`, null)

  // See the matching comment in confirm/route.ts: the queue submits this as
  // a real HTML <form>, so it must return a redirect the browser can follow
  // back to the queue, not a bare JSON blob.
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ status: updated.status })
  }
  return NextResponse.redirect(new URL('/identity-matching', request.url), 303)
}

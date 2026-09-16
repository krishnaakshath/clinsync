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
  return NextResponse.json({ status: updated.status })
}

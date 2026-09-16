import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const [updated] = await getDb().update(identityMatches).set({ status: 'confirmed' }).where(eq(identityMatches.id, Number(id))).returning()
  await logAudit(session, `confirmed identity match ${id}`, null)
  return NextResponse.json({ status: updated.status })
}

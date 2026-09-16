import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const matches = await getDb().select().from(identityMatches).where(eq(identityMatches.status, 'pending'))
  return NextResponse.json({ matches })
}

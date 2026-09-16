import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { requireSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const rows = await getDb().select().from(trials)
  return NextResponse.json({ trials: rows })
}

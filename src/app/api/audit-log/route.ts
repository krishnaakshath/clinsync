import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { auditLog } from '@/db/schema'
import { desc } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const entries = await getDb().select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(200)
  return NextResponse.json({ entries })
}

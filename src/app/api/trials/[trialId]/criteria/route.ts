import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { trialId } = await params
  const body = await request.json()
  await getDb().update(trials).set(body).where(eq(trials.id, trialId))
  await logAudit(session, `updated criteria for trial ${trialId}`, null)
  return NextResponse.json({ ok: true })
}

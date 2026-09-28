import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { setQueueDisplayPin } from '@/lib/queries/settings'

const pinSchema = z.object({ pin: z.string().min(4).max(32) }).strict()

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const parsed = pinSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })

  await setQueueDisplayPin(parsed.data.pin)
  await logAudit(session, 'set queue display PIN', null)
  return NextResponse.json({ ok: true })
}

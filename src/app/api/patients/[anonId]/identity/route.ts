import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { identityVerifications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { invalidateCache, patientDetailCacheKey } from '@/lib/cache'
import { encryptSensitive } from '@/lib/crypto'

const verifySchema = z.object({
  idType: z.enum(['drivers_license', 'state_id', 'passport']),
  idNumber: z.string().min(1),
}).strict()

export async function PUT(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { anonId } = await params

  const parsed = verifySchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid identity verification payload', details: parsed.error.flatten() }, { status: 400 })

  const [existing] = await getDb().select().from(identityVerifications).where(eq(identityVerifications.patientId, anonId))
  const idNumberEncrypted = encryptSensitive(parsed.data.idNumber)

  if (existing) {
    await getDb().update(identityVerifications).set({ idType: parsed.data.idType, idNumberEncrypted, verified: true, verifiedBy: session.name, verifiedAt: new Date() }).where(eq(identityVerifications.patientId, anonId))
  } else {
    await getDb().insert(identityVerifications).values({ patientId: anonId, idType: parsed.data.idType, idNumberEncrypted, verified: true, verifiedBy: session.name, verifiedAt: new Date() })
  }

  await invalidateCache(patientDetailCacheKey(anonId))
  await logAudit(session, 'verified identity', anonId)
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody } from '@/lib/http'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { identityVerifications, patients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
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
  // Recording a checked government ID is a front-desk / coordinator task
  // (the same operations surface as Identity Matching), not a PI one.
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { anonId } = await params

  const parsed = verifySchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid identity verification payload', details: parsed.error.flatten() }, { status: 400 })

  const [patient] = await getDb().select({ id: patients.id }).from(patients).where(eq(patients.id, anonId))
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

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

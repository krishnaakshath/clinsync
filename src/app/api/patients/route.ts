import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { invalidateCache, patientListCacheKey } from '@/lib/cache'
import { listPatientsWithStatus } from '@/lib/queries/patients'

const addClientSchema = z.object({
  nameIntakeq: z.string().min(1),
  dobIntakeq: z.string().min(1),
  emailIntakeq: z.string().email().optional(),
  phoneIntakeq: z.string().optional(),
  cityIntakeq: z.string().optional(),
  zipIntakeq: z.string().optional(),
  currentProvider: z.string().optional(),
  referralType: z.string().optional(),
  availability: z.string().optional(),
  commConsentSigned: z.boolean().optional(),
  commConsentPref: z.string().optional(),
  formNotes: z.string().optional(),
}).strict()

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const trialId = request.nextUrl.searchParams.get('trialId')
  const patientsWithStatus = await listPatientsWithStatus(trialId)

  await logAudit(session, 'viewed patient list', null)

  return NextResponse.json({ patients: patientsWithStatus })
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = addClientSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid new-client payload', details: parsed.error.flatten() }, { status: 400 })

  // Anon IDs are RD-#### sequential; find the current max and increment.
  const existing = await getDb().select({ id: patients.id }).from(patients)
  const nextNum = existing.length === 0 ? 1 : Math.max(...existing.map((p) => parseInt(p.id.replace('RD-', ''), 10))) + 1
  const newId = `RD-${String(nextNum).padStart(4, '0')}`

  const [created] = await getDb().insert(patients).values({
    id: newId,
    intakeqClientIdEncrypted: `ENC[pending-${newId}]`,
    ...parsed.data,
  }).returning()

  await invalidateCache(patientListCacheKey(null))
  await logAudit(session, 'added new client', newId)
  return NextResponse.json(created, { status: 201 })
}

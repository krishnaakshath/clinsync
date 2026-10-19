import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody } from '@/lib/http'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createEncounter, listEncounters } from '@/lib/queries/encounters'

const createEncounterSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.number().int().positive(),
  serviceLocationId: z.number().int().positive(),
  serviceStartDate: z.string().min(1),
  serviceEndDate: z.string().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']),
}).strict()

// Encounters are clinical data -- gated by session only, no
// `canAccessOperations` check, unlike charges/payments. PI can see
// encounters (per the design spec's §5 resolution).
export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  await logAudit(session, 'viewed encounters', null)
  return NextResponse.json(await listEncounters())
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = createEncounterSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid encounter payload', details: parsed.error.flatten() }, { status: 400 })

  const created = await createEncounter(parsed.data)
  await logAudit(session, 'created encounter', parsed.data.patientId)
  return NextResponse.json(created, { status: 201 })
}

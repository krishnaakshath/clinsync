import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { appointments } from '@/db/schema'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listAppointmentsInRange } from '@/lib/queries/appointments'

const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.number().int().positive(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  visitReason: z.string().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
}).strict()

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to query parameters are required' }, { status: 400 })

  const providerIdsParam = url.searchParams.get('providerIds')
  const providerIds = providerIdsParam !== null
    ? (providerIdsParam === '' ? [] : providerIdsParam.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))
    : undefined

  const results = await listAppointmentsInRange(new Date(from), new Date(to), providerIds)
  return NextResponse.json(results)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = createAppointmentSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid appointment payload', details: parsed.error.flatten() }, { status: 400 })

  const startsAt = new Date(parsed.data.startsAt)
  const endsAt = new Date(parsed.data.endsAt)
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt must be a valid time after startsAt' }, { status: 400 })
  }

  const [created] = await getDb().insert(appointments).values({
    patientId: parsed.data.patientId,
    providerId: parsed.data.providerId,
    startsAt,
    endsAt,
    visitReason: parsed.data.visitReason,
    status: parsed.data.status ?? 'scheduled',
  }).returning()

  await logAudit(session, 'scheduled appointment', parsed.data.patientId)
  return NextResponse.json(created, { status: 201 })
}

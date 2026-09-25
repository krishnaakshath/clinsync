import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getAdmissionById, transferAdmission } from '@/lib/queries/admissions'
import { listActiveProviders } from '@/lib/queries/providers'

const transferSchema = z.object({ toRoomId: z.number().int().positive(), reason: z.string().min(1) }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['frontdesk', 'admin', 'crc', 'pi'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admissionId = Number(id)
  if (!Number.isInteger(admissionId)) return NextResponse.json({ error: 'Invalid admission id' }, { status: 400 })

  const parsed = transferSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid transfer payload', details: parsed.error.flatten() }, { status: 400 })

  const admission = await getAdmissionById(admissionId)
  if (!admission) return NextResponse.json({ error: 'Admission not found' }, { status: 404 })

  // A PI may only transfer their own attending patients -- same ownership
  // check as the Front Desk schedule/decline routes (best-effort last-name
  // match against listActiveProviders, since there's no real session<->
  // provider-row link yet).
  if (session.role === 'pi') {
    const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
    const providersList = await listActiveProviders()
    const providerMatch = providersList.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
    if (!providerMatch || admission.attendingProviderId !== providerMatch.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const result = await transferAdmission(admissionId, parsed.data.toRoomId, parsed.data.reason, session.name)
  if (!result.ok) {
    const status = result.error === 'Admission not found' ? 404 : result.error === 'This admission has already been discharged' ? 409 : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  await logAudit(session, `transferred patient's admission ${admissionId} to room ${parsed.data.toRoomId}`, admission.patientId)
  return NextResponse.json({ ok: true })
}

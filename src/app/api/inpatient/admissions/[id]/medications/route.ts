import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getAdmissionById } from '@/lib/queries/admissions'
import { orderMedication, listMedicationsForAdmission, getMedicationEpisodeById } from '@/lib/queries/medication-administrations'

const orderSchema = z.object({
  medicationEpisodeId: z.number().int().optional(),
  medicationName: z.string().min(1),
  dose: z.string().min(1),
  scheduledFor: z.string().min(1),
}).strict()

// Read access is wider than the POST below (admin/pi/crc/frontdesk vs.
// admin/pi only) per the Global Constraints table -- viewing the MAR is not
// the same privilege as ordering or charting a dose.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['pi', 'admin', 'crc', 'frontdesk'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admissionId = Number(id)
  if (!Number.isInteger(admissionId)) return NextResponse.json({ error: 'Invalid admission id' }, { status: 400 })

  const admission = await getAdmissionById(admissionId)
  if (!admission) return NextResponse.json({ error: 'Admission not found' }, { status: 404 })

  const medications = await listMedicationsForAdmission(admissionId)
  return NextResponse.json(medications)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['pi', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admissionId = Number(id)
  if (!Number.isInteger(admissionId)) return NextResponse.json({ error: 'Invalid admission id' }, { status: 400 })

  const admission = await getAdmissionById(admissionId)
  if (!admission) return NextResponse.json({ error: 'Admission not found' }, { status: 404 })

  const parsed = orderSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid medication order', details: parsed.error.flatten() }, { status: 400 })

  if (parsed.data.medicationEpisodeId !== undefined) {
    const episode = await getMedicationEpisodeById(parsed.data.medicationEpisodeId)
    if (!episode || episode.patientId !== admission.patientId) {
      return NextResponse.json({ error: 'medicationEpisodeId does not belong to this admission\'s patient' }, { status: 400 })
    }
  }

  const scheduledFor = new Date(parsed.data.scheduledFor)
  if (isNaN(scheduledFor.getTime())) return NextResponse.json({ error: 'Invalid scheduledFor' }, { status: 400 })

  const created = await orderMedication({
    admissionId,
    medicationEpisodeId: parsed.data.medicationEpisodeId ?? null,
    medicationName: parsed.data.medicationName,
    dose: parsed.data.dose,
    scheduledFor,
  })

  await logAudit(session, 'ordered medication', admission.patientId)
  return NextResponse.json(created, { status: 201 })
}

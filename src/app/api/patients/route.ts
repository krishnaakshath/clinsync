import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { invalidateCache, patientListCacheKey } from '@/lib/cache'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { getPayerById } from '@/lib/queries/payers'
import * as tebra from '@/connectors/tebra.mock'

// A patient's clinical chart is created in Tebra, never as a row typed
// directly into Clinsync -- Clinsync reconciles and displays chart data, it
// isn't itself a system of record. So this collects Tebra-shaped
// demographics only (no referralType/availability/consent -- those belong
// to an IntakeQ intake, which this patient doesn't have yet).
const addClientSchema = z.object({
  name: z.string().min(1),
  dob: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  currentProvider: z.string().optional(),
  primaryPayerId: z.number().int().optional(),
  primaryMemberId: z.string().optional(),
  primaryGroupNumber: z.string().optional(),
  primaryPlanType: z.enum(['ppo', 'hmo', 'epo', 'pos', 'medicare', 'medicaid']).optional(),
  primarySubscriberName: z.string().optional(),
  primarySubscriberRelationship: z.enum(['self', 'spouse', 'child', 'other']).optional(),
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
  // This route accepts the same primary-insurance fields (payer, member ID,
  // group number, etc.) as PATCH .../insurance-card, which already restricts
  // writes to admin/crc/frontdesk -- pi is a read-only role for insurance
  // data per spec. Gated at the route level (not per-field) to match that
  // sibling route's precedent.
  if (!['admin', 'crc', 'frontdesk'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = addClientSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid new-client payload', details: parsed.error.flatten() }, { status: 400 })

  if (parsed.data.primaryPayerId !== undefined) {
    const payer = await getPayerById(parsed.data.primaryPayerId)
    if (!payer) return NextResponse.json({ error: 'primaryPayerId does not reference a real payer' }, { status: 400 })
  }

  const [firstName, ...rest] = parsed.data.name.trim().split(/\s+/)
  const lastName = rest.join(' ') || firstName
  const tebraPatient = await tebra.createPatient({
    firstName,
    lastName,
    birthDate: parsed.data.dob,
    city: parsed.data.city ?? '',
    zip: parsed.data.zip ?? '',
    email: parsed.data.email ?? '',
    generalPractitioner: parsed.data.currentProvider ?? '',
  })

  // Anon IDs are RD-#### sequential; find the current max and increment.
  const existing = await getDb().select({ id: patients.id }).from(patients)
  const nextNum = existing.length === 0 ? 1 : Math.max(...existing.map((p) => parseInt(p.id.replace('RD-', ''), 10))) + 1
  const newId = `RD-${String(nextNum).padStart(4, '0')}`
  const fullName = `${tebraPatient.firstName} ${tebraPatient.lastName}`

  // nameIntakeq/dobIntakeq are NOT NULL (every patient has a required
  // dual-sourced pair) -- this chart has no real IntakeQ referral yet, so
  // they're mirrored placeholders from the Tebra data, not fabricated
  // intake answers. intakeqClientIdRef is flagged "no-intake" rather than
  // "pending" so it reads as a real, distinct state, not a stalled referral.
  const [created] = await getDb().insert(patients).values({
    id: newId,
    intakeqClientIdRef: `ENC[no-intake-${newId}]`,
    tebraPatientIdRef: `ENC[${tebraPatient.tebraPatientId}]`,
    nameIntakeq: fullName,
    nameTebra: fullName,
    dobIntakeq: tebraPatient.birthDate,
    dobTebra: tebraPatient.birthDate,
    cityTebra: tebraPatient.city || null,
    zipTebra: tebraPatient.zip || null,
    emailTebra: tebraPatient.email || null,
    currentProvider: tebraPatient.generalPractitioner || null,
    primaryPayerId: parsed.data.primaryPayerId ?? null,
    primaryMemberId: parsed.data.primaryMemberId ?? null,
    primaryGroupNumber: parsed.data.primaryGroupNumber ?? null,
    primaryPlanType: parsed.data.primaryPlanType ?? null,
    primarySubscriberName: parsed.data.primarySubscriberName ?? null,
    primarySubscriberRelationship: parsed.data.primarySubscriberRelationship ?? null,
  }).returning()

  await invalidateCache(patientListCacheKey(null))
  await logAudit(session, 'added new client', newId)
  return NextResponse.json(created, { status: 201 })
}

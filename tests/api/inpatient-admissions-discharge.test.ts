import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/app/api/inpatient/admissions/[id]/discharge/route'
import { getDb } from '@/db/client'
import { admissions, patients, appointments } from '@/db/schema'
import { createAdmission } from '@/lib/queries/admissions'

let sessionRole: 'admin' | 'pi' | 'frontdesk' = 'pi'
let sessionName = 'Dr. Chen'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: sessionName })) }))
vi.mock('@/lib/queries/providers', () => ({ listActiveProviders: vi.fn(async () => [{ id: 1, name: 'Dr. Chen', credentials: null, specialty: 'Internal Medicine', colorTag: '#000', isActive: true }]) }))

const createdAdmissionIds: number[] = []
const createdAppointmentIds: number[] = []
afterEach(async () => {
  sessionRole = 'pi'
  sessionName = 'Dr. Chen'
  while (createdAppointmentIds.length > 0) await getDb().delete(appointments).where(eq(appointments.id, createdAppointmentIds.pop()!))
  while (createdAdmissionIds.length > 0) await getDb().delete(admissions).where(eq(admissions.id, createdAdmissionIds.pop()!))
})

describe('POST /api/inpatient/admissions/[id]/discharge', () => {
  it('rejects a discharge missing a required field', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 1, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: '', dischargeSummaryNotes: 'E' }) })
    const res = await POST(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(400)
  })

  it('discharges successfully with all five fields present, no follow-up', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 1, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: 'D', dischargeSummaryNotes: 'E' }) })
    const res = await POST(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(200)
  })

  it('rejects a PI discharging an admission they are not the attending provider for', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 999, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: 'D', dischargeSummaryNotes: 'E' }) })
    const res = await POST(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(403)
  })

  it('rejects discharging an already-discharged admission', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 1, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)
    const body = JSON.stringify({ dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: 'D', dischargeSummaryNotes: 'E' })
    await POST(new Request('http://localhost', { method: 'POST', body }) as never, { params: Promise.resolve({ id: String(admission.id) }) })

    const res = await POST(new Request('http://localhost', { method: 'POST', body }) as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(409)
  })

  it('rejects a follow-up appointment whose end is not after its start', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 1, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)

    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() - 60 * 1000)
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: 'D', dischargeSummaryNotes: 'E',
      followUpStartsAt: startsAt.toISOString(), followUpEndsAt: endsAt.toISOString(),
    }) })
    const res = await POST(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(400)

    const updated = await getDb().select().from(admissions).where(eq(admissions.id, admission.id))
    expect(updated[0].status).toBe('admitted')
  })

  it('rejects a follow-up appointment that conflicts with an existing appointment for the same provider', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const admission = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: 1, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(admission.id)

    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000)
    const [existingAppt] = await getDb().insert(appointments).values({
      patientId: patientRow.id,
      providerId: 1,
      startsAt,
      endsAt,
      visitReason: 'Pre-existing appointment blocking the follow-up slot',
      status: 'scheduled',
    }).returning()
    createdAppointmentIds.push(existingAppt.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      dischargeDiagnosis: 'A', dischargeDrugs: 'B', dischargeDevices: 'C', dischargeDiet: 'D', dischargeSummaryNotes: 'E',
      followUpStartsAt: startsAt.toISOString(), followUpEndsAt: endsAt.toISOString(),
    }) })
    const res = await POST(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(409)

    const updated = await getDb().select().from(admissions).where(eq(admissions.id, admission.id))
    expect(updated[0].status).toBe('admitted')
  })
})

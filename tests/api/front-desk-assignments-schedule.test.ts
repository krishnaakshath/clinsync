import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as schedule } from '@/app/api/front-desk/assignments/[id]/schedule/route'
import { POST as decline } from '@/app/api/front-desk/assignments/[id]/decline/route'
import { getDb } from '@/db/client'
import { doctorAssignments, appointments } from '@/db/schema'
import { createDoctorAssignment } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))

const createdAssignmentIds: number[] = []
const createdAppointmentIds: number[] = []
afterEach(async () => {
  while (createdAssignmentIds.length > 0) await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, createdAssignmentIds.pop()!))
  while (createdAppointmentIds.length > 0) await getDb().delete(appointments).where(eq(appointments.id, createdAppointmentIds.pop()!))
})

describe('POST /api/front-desk/assignments/[id]/schedule', () => {
  it('creates the appointment and marks the assignment scheduled', async () => {
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-03T09:00:00', endsAt: '2026-11-03T09:30:00', visitReason: 'Follow-up' }) })
    const res = await schedule(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    createdAppointmentIds.push(body.appointmentId)
    expect(body.status).toBe('scheduled')
  })

  it('returns 403 for a frontdesk session (only the assigned doctor schedules)', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'frontdesk', name: 'Taylor Nguyen' })
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-03T10:00:00', endsAt: '2026-11-03T10:30:00', visitReason: 'Follow-up' }) })
    const res = await schedule(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)
  })

  it('returns 403 when the assignment belongs to a different provider than the calling PI', async () => {
    const providers = await listActiveProviders()
    // providers[1] is not "Dr. R. Kunam" (the mocked session's name) -- this
    // assignment was routed to a different doctor entirely.
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[1].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-03T11:00:00', endsAt: '2026-11-03T11:30:00', visitReason: 'Follow-up' }) })
    const res = await schedule(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/front-desk/assignments/[id]/decline', () => {
  it('marks the assignment declined with the given reason', async () => {
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reason: 'Fully booked this week' }) })
    const res = await decline(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('declined')
    expect(body.declineReason).toBe('Fully booked this week')
  })

  it('returns 403 when the assignment belongs to a different provider than the calling PI', async () => {
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[1].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reason: 'Not mine' }) })
    const res = await decline(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)

    const [row] = await getDb().select().from(doctorAssignments).where(eq(doctorAssignments.id, assignment.id))
    expect(row.status).toBe('pending')
  })
})

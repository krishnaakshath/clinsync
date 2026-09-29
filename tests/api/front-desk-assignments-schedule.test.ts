import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as schedule } from '@/app/api/front-desk/assignments/[id]/schedule/route'
import { POST as decline } from '@/app/api/front-desk/assignments/[id]/decline/route'
import { getDb } from '@/db/client'
import { doctorAssignments, appointments } from '@/db/schema'
import { createDoctorAssignment } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'pi', name: 'Dr. R. Kunam' })) }))

// `listActiveProviders()` has no ORDER BY, so array position isn't a stable
// way to pick "the mocked PI's own provider row" vs. "someone else's" --
// look each up by name explicitly instead.
async function kunamProviderId(): Promise<number> {
  const providers = await listActiveProviders()
  const kunam = providers.find((p) => p.name.includes('Kunam'))
  if (!kunam) throw new Error('Seeded provider "Dr. R. Kunam" not found -- run npm run db:seed')
  return kunam.id
}

async function otherProviderId(): Promise<number> {
  const providers = await listActiveProviders()
  const other = providers.find((p) => !p.name.includes('Kunam'))
  if (!other) throw new Error('No non-Kunam provider found -- run npm run db:seed')
  return other.id
}

const createdAssignmentIds: number[] = []
const createdAppointmentIds: number[] = []
afterEach(async () => {
  while (createdAssignmentIds.length > 0) await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, createdAssignmentIds.pop()!))
  while (createdAppointmentIds.length > 0) await getDb().delete(appointments).where(eq(appointments.id, createdAppointmentIds.pop()!))
})

describe('POST /api/front-desk/assignments/[id]/schedule', () => {
  it('creates the appointment and marks the assignment scheduled', async () => {
    const providerId = await kunamProviderId()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
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
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'frontdesk', name: 'Taylor Nguyen', userId: null })
    const providerId = await kunamProviderId()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-03T10:00:00', endsAt: '2026-11-03T10:30:00', visitReason: 'Follow-up' }) })
    const res = await schedule(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)
  })

  it('returns 403 when the assignment belongs to a different provider than the calling PI', async () => {
    // A real provider that is NOT "Dr. R. Kunam" (the mocked session's name) -- this
    // assignment was routed to a different doctor entirely.
    const providerId = await otherProviderId()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-03T11:00:00', endsAt: '2026-11-03T11:30:00', visitReason: 'Follow-up' }) })
    const res = await schedule(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/front-desk/assignments/[id]/decline', () => {
  it('marks the assignment declined with the given reason', async () => {
    const providerId = await kunamProviderId()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reason: 'Fully booked this week' }) })
    const res = await decline(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('declined')
    expect(body.declineReason).toBe('Fully booked this week')
  })

  it('returns 403 when the assignment belongs to a different provider than the calling PI', async () => {
    const providerId = await otherProviderId()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reason: 'Not mine' }) })
    const res = await decline(req as never, { params: Promise.resolve({ id: String(assignment.id) }) })
    expect(res.status).toBe(403)

    const [row] = await getDb().select().from(doctorAssignments).where(eq(doctorAssignments.id, assignment.id))
    expect(row.status).toBe('pending')
  })
})

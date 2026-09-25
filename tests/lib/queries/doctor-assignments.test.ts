import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { doctorAssignments, appointments } from '@/db/schema'
import { createDoctorAssignment, listPendingAssignmentsForProvider, scheduleAssignment, declineAssignment } from '@/lib/queries/doctor-assignments'
import { listActiveProviders } from '@/lib/queries/providers'

const createdAssignmentIds: number[] = []
const createdAppointmentIds: number[] = []
afterEach(async () => {
  while (createdAssignmentIds.length > 0) await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, createdAssignmentIds.pop()!))
  while (createdAppointmentIds.length > 0) await getDb().delete(appointments).where(eq(appointments.id, createdAppointmentIds.pop()!))
})

describe('listPendingAssignmentsForProvider', () => {
  it('only returns pending assignments for the given provider', async () => {
    const providers = await listActiveProviders()
    const mine = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    const other = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[1].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(mine.id, other.id)

    const result = await listPendingAssignmentsForProvider(providers[0].id)
    expect(result.some((a) => a.id === mine.id)).toBe(true)
    expect(result.some((a) => a.id === other.id)).toBe(false)
  })
})

describe('scheduleAssignment', () => {
  it('sets status to scheduled and records the appointmentId', async () => {
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)
    const [appointment] = await getDb().insert(appointments).values({ patientId: 'RD-0001', providerId: providers[0].id, startsAt: new Date('2026-11-02T09:00:00'), endsAt: new Date('2026-11-02T09:30:00'), visitReason: 'Test' }).returning()
    createdAppointmentIds.push(appointment.id)

    const updated = await scheduleAssignment(assignment.id, appointment.id)
    expect(updated?.status).toBe('scheduled')
    expect(updated?.appointmentId).toBe(appointment.id)
  })
})

describe('declineAssignment', () => {
  it('sets status to declined and records the reason, leaving it visible', async () => {
    const providers = await listActiveProviders()
    const assignment = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(assignment.id)

    const updated = await declineAssignment(assignment.id, 'Fully booked this week')
    expect(updated?.status).toBe('declined')
    expect(updated?.declineReason).toBe('Fully booked this week')

    const stillThere = await listPendingAssignmentsForProvider(providers[0].id)
    // Declined assignments are no longer "pending" for the doctor's queue,
    // but the row itself must still exist for reception to see and reassign.
    expect(stillThere.some((a) => a.id === assignment.id)).toBe(false)
    const [row] = await getDb().select().from(doctorAssignments).where(eq(doctorAssignments.id, assignment.id))
    expect(row).toBeDefined()
    expect(row.status).toBe('declined')
  })
})

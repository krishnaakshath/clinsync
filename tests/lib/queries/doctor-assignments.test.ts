import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { doctorAssignments, appointments, patients } from '@/db/schema'
import { createDoctorAssignment, listPendingAssignmentsForProvider, scheduleAssignment, declineAssignment, listTodaysAssignments, countPendingAssignmentsForProvider, countUnacknowledgedDeclines, acknowledgeDecline, listAllAssignments } from '@/lib/queries/doctor-assignments'
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

describe('listTodaysAssignments', () => {
  it('includes an assignment created just now but excludes one created yesterday', async () => {
    const providers = await listActiveProviders()
    const today = await createDoctorAssignment({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test today', roomId: null, assignedByName: 'Taylor Nguyen' })
    createdAssignmentIds.push(today.id)

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const [oldRow] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providers[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Test yesterday', assignedByName: 'Taylor Nguyen', createdAt: yesterday }).returning()
    createdAssignmentIds.push(oldRow.id)

    const result = await listTodaysAssignments()
    expect(result.some((a) => a.id === today.id)).toBe(true)
    expect(result.some((a) => a.id === oldRow.id)).toBe(false)
  })
})

type Urg = 'routine' | 'urgent' | 'emergency'
async function mk(providerId: number, urgency: Urg = 'routine') {
  const a = await createDoctorAssignment({ patientId: 'RD-0001', providerId, visitType: 'outpatient', urgency, reason: 'Test', roomId: null, assignedByName: 'Taylor Nguyen' })
  createdAssignmentIds.push(a.id)
  return a
}

describe('urgency ordering and patient name', () => {
  it('orders emergency > urgent > routine, oldest first within a band', async () => {
    const [p] = await listActiveProviders()
    const r1 = await mk(p.id, 'routine')
    const e = await mk(p.id, 'emergency')
    const r2 = await mk(p.id, 'routine')
    const u = await mk(p.id, 'urgent')
    const ids = new Set([r1.id, e.id, r2.id, u.id])
    const result = (await listPendingAssignmentsForProvider(p.id)).filter((a) => ids.has(a.id)).map((a) => a.id)
    expect(result).toEqual([e.id, u.id, r1.id, r2.id])
  })

  it('returns patientName from patients.name', async () => {
    const [p] = await listActiveProviders()
    const a = await mk(p.id)
    const [pt] = await getDb().select({ name: patients.name }).from(patients).where(eq(patients.id, 'RD-0001'))
    const row = (await listPendingAssignmentsForProvider(p.id)).find((x) => x.id === a.id)
    expect(row?.patientName).toBe(pt.name)
  })
})

describe('counts and acknowledge', () => {
  it("countPendingAssignmentsForProvider counts only that provider's pending rows", async () => {
    const [p] = await listActiveProviders()
    const before = await countPendingAssignmentsForProvider(p.id)
    await mk(p.id)
    await mk(p.id)
    const d = await mk(p.id)
    await declineAssignment(d.id, 'No room')
    expect(await countPendingAssignmentsForProvider(p.id)).toBe(before + 2)
  })

  it('countUnacknowledgedDeclines tracks decline and acknowledge', async () => {
    const [p] = await listActiveProviders()
    const before = await countUnacknowledgedDeclines()
    const a = await mk(p.id)
    await declineAssignment(a.id, 'No room')
    expect(await countUnacknowledgedDeclines()).toBe(before + 1)
    const ack = await acknowledgeDecline(a.id, 'Taylor Nguyen')
    expect(ack?.declineAcknowledgedByName).toBe('Taylor Nguyen')
    expect(ack?.declineAcknowledgedAt).not.toBeNull()
    expect(await countUnacknowledgedDeclines()).toBe(before)
  })

  it('acknowledgeDecline returns null for pending or already-acknowledged rows', async () => {
    const [p] = await listActiveProviders()
    const a = await mk(p.id)
    expect(await acknowledgeDecline(a.id, 'Taylor Nguyen')).toBeNull()
    await declineAssignment(a.id, 'No room')
    expect(await acknowledgeDecline(a.id, 'Taylor Nguyen')).not.toBeNull()
    expect(await acknowledgeDecline(a.id, 'Someone Else')).toBeNull()
  })
})

describe('listAllAssignments ordering', () => {
  it('puts an unacknowledged decline before a newer pending row', async () => {
    const [p] = await listActiveProviders()
    const d = await mk(p.id)
    await declineAssignment(d.id, 'No room')
    const pend = await mk(p.id)
    const ids = (await listAllAssignments()).map((a) => a.id)
    expect(ids.indexOf(d.id)).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf(d.id)).toBeLessThan(ids.indexOf(pend.id))
  })
})

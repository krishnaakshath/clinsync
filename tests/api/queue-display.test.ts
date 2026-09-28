import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appSettings, patients, providers, doctorAssignments, appointments, admissions, rooms } from '@/db/schema'
import { GET } from '@/app/api/queue-display/route'
import { listActiveProviders } from '@/lib/queries/providers'

const PIN_HEADER = 'x-queue-display-pin'
const TEST_PIN = 'lobby-4821'

async function setPin(pin: string | null) {
  const [row] = await getDb().select().from(appSettings)
  await getDb().update(appSettings).set({ queueDisplayPin: pin }).where(eq(appSettings.id, row.id))
}

const createdAssignmentIds: number[] = []
const createdRoomIds: number[] = []
const createdAdmissionIds: number[] = []
const createdAppointmentIds: number[] = []
afterEach(async () => {
  while (createdAdmissionIds.length > 0) await getDb().delete(admissions).where(eq(admissions.id, createdAdmissionIds.pop()!))
  while (createdAssignmentIds.length > 0) await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, createdAssignmentIds.pop()!))
  while (createdAppointmentIds.length > 0) await getDb().delete(appointments).where(eq(appointments.id, createdAppointmentIds.pop()!))
  while (createdRoomIds.length > 0) await getDb().delete(rooms).where(eq(rooms.id, createdRoomIds.pop()!))
  await setPin(null)
})

describe('GET /api/queue-display', () => {
  it('returns 401 when no PIN is set on appSettings (Review Focus #1)', async () => {
    await setPin(null)
    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: 'anything' } })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the wrong PIN is supplied', async () => {
    await setPin(TEST_PIN)
    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: 'wrong-pin' } })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 401 when no PIN header is supplied at all', async () => {
    await setPin(TEST_PIN)
    const req = new Request('http://localhost/api/queue-display')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('never includes a real patient name in the response body (Review Focus #2)', async () => {
    await setPin(TEST_PIN)
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const realName = patientRow.nameIntakeq ?? patientRow.nameTebra
    const providerRows = await listActiveProviders()
    const created = await getDb().insert(doctorAssignments).values({ patientId: patientRow.id, providerId: providerRows[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'Should never appear', assignedByName: 'Test Staff', queueTicketNumber: 1 }).returning()
    createdAssignmentIds.push(created[0].id)

    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: TEST_PIN } })
    const res = await GET(req as never)
    const bodyText = await res.text()
    expect(res.status).toBe(200)
    if (realName) expect(bodyText.includes(realName)).toBe(false)
    expect(bodyText.includes('Should never appear')).toBe(false) // the reason
    expect(bodyText.includes(patientRow.id)).toBe(false) // not even the anonId
  })

  it('maps pending to "waiting" and scheduled+room to "ready"', async () => {
    await setPin(TEST_PIN)
    const providerRows = await listActiveProviders()
    const [room] = await getDb().insert(rooms).values({ ward: 'Test Ward', roomNumber: '901', bedNumber: 'A', status: 'occupied' }).returning()
    createdRoomIds.push(room.id)

    const [waiting] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'x', assignedByName: 'Test Staff', queueTicketNumber: 101, status: 'pending' }).returning()
    createdAssignmentIds.push(waiting.id)
    const [ready] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, visitType: 'inpatient', urgency: 'urgent', reason: 'x', assignedByName: 'Test Staff', queueTicketNumber: 102, status: 'scheduled', roomId: room.id }).returning()
    createdAssignmentIds.push(ready.id)

    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: TEST_PIN } })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.tickets.find((t: any) => t.ticketNumber === 101)?.stage).toBe('waiting')
    expect(body.tickets.find((t: any) => t.ticketNumber === 102)?.stage).toBe('ready')
  })

  it('excludes a declined assignment', async () => {
    await setPin(TEST_PIN)
    const providerRows = await listActiveProviders()
    const [declined] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'x', assignedByName: 'Test Staff', queueTicketNumber: 201, status: 'declined', declineReason: 'x' }).returning()
    createdAssignmentIds.push(declined.id)

    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: TEST_PIN } })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.tickets.some((t: any) => t.ticketNumber === 201)).toBe(false)
  })

  it('excludes an assignment that already has an active admission (Review Focus #3)', async () => {
    await setPin(TEST_PIN)
    const providerRows = await listActiveProviders()
    const [assignment] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, visitType: 'inpatient', urgency: 'routine', reason: 'x', assignedByName: 'Test Staff', queueTicketNumber: 301, status: 'pending' }).returning()
    createdAssignmentIds.push(assignment.id)
    const [admission] = await getDb().insert(admissions).values({ patientId: 'RD-0001', attendingProviderId: providerRows[0].id, createdFromAssignmentId: assignment.id }).returning()
    createdAdmissionIds.push(admission.id)

    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: TEST_PIN } })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.tickets.some((t: any) => t.ticketNumber === 301)).toBe(false)
  })

  it('excludes an assignment whose appointment is already completed (Review Focus #3)', async () => {
    await setPin(TEST_PIN)
    const providerRows = await listActiveProviders()
    const [appointment] = await getDb().insert(appointments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 60000), visitReason: 'x', status: 'completed' }).returning()
    createdAppointmentIds.push(appointment.id)
    const [assignment] = await getDb().insert(doctorAssignments).values({ patientId: 'RD-0001', providerId: providerRows[0].id, visitType: 'outpatient', urgency: 'routine', reason: 'x', assignedByName: 'Test Staff', queueTicketNumber: 401, status: 'scheduled', appointmentId: appointment.id }).returning()
    createdAssignmentIds.push(assignment.id)

    const req = new Request('http://localhost/api/queue-display', { headers: { [PIN_HEADER]: TEST_PIN } })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.tickets.some((t: any) => t.ticketNumber === 401)).toBe(false)
  })
})

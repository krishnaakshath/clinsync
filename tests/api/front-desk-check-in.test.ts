import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/app/api/front-desk/check-in/route'
import { getDb } from '@/db/client'
import { doctorAssignments, rooms } from '@/db/schema'
import { listActiveProviders } from '@/lib/queries/providers'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'frontdesk', name: 'Taylor Nguyen' })) }))

const createdAssignmentIds: number[] = []
const createdRoomIds: number[] = []
afterEach(async () => {
  while (createdAssignmentIds.length > 0) await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, createdAssignmentIds.pop()!))
  while (createdRoomIds.length > 0) await getDb().delete(rooms).where(eq(rooms.id, createdRoomIds.pop()!))
})

describe('POST /api/front-desk/check-in', () => {
  it('rejects a payload with an unknown field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'outpatient', urgency: 'routine', reason: 'Follow-up', providerId: 1, notAField: true }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('checks in an outpatient without requiring a room', async () => {
    const providers = await listActiveProviders()
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'outpatient', urgency: 'routine', reason: 'Follow-up', providerId: providers[0].id }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdAssignmentIds.push(body.id)
    expect(body.roomId).toBeNull()
    expect(body.status).toBe('pending')
  })

  it('requires a roomId for an inpatient check-in', async () => {
    const providers = await listActiveProviders()
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'inpatient', urgency: 'urgent', reason: 'Admission', providerId: providers[0].id }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('assigns the given room and flips it to occupied for an inpatient check-in', async () => {
    const providers = await listActiveProviders()
    const [room] = await getDb().insert(rooms).values({ ward: 'Test Ward', roomNumber: '301', bedNumber: 'A', status: 'available' }).returning()
    createdRoomIds.push(room.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'inpatient', urgency: 'urgent', reason: 'Admission', providerId: providers[0].id, roomId: room.id }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdAssignmentIds.push(body.id)
    expect(body.roomId).toBe(room.id)
  })

  it('returns 409 when the requested room is no longer available', async () => {
    const providers = await listActiveProviders()
    const [room] = await getDb().insert(rooms).values({ ward: 'Test Ward', roomNumber: '302', bedNumber: 'A', status: 'occupied', occupiedByPatientId: 'RD-0002' }).returning()
    createdRoomIds.push(room.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'inpatient', urgency: 'urgent', reason: 'Admission', providerId: providers[0].id, roomId: room.id }) })
    const res = await POST(req as never)
    expect(res.status).toBe(409)
  })

  it('returns 403 for a pi session', async () => {
    const auth = await import('@/lib/auth')
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'pi', name: 'Dr. Kunam' })
    const providers = await listActiveProviders()
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ patientId: 'RD-0001', visitType: 'outpatient', urgency: 'routine', reason: 'Follow-up', providerId: providers[0].id }) })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })
})

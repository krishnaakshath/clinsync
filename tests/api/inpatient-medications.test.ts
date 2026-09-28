import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as orderRoute } from '@/app/api/inpatient/admissions/[id]/medications/route'
import { POST as administerRoute } from '@/app/api/inpatient/admissions/[id]/medications/[medId]/administer/route'
import { getDb } from '@/db/client'
import { patients, providers, rooms, admissions, medicationAdministrations } from '@/db/schema'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'admin'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: 'Test Admin' })) }))

const createdMarIds: number[] = []
const createdAdmissionIds: number[] = []
const createdRoomIds: number[] = []
afterEach(async () => {
  sessionRole = 'admin'
  while (createdMarIds.length > 0) await getDb().delete(medicationAdministrations).where(eq(medicationAdministrations.id, createdMarIds.pop()!))
  while (createdAdmissionIds.length > 0) await getDb().delete(admissions).where(eq(admissions.id, createdAdmissionIds.pop()!))
  while (createdRoomIds.length > 0) await getDb().delete(rooms).where(eq(rooms.id, createdRoomIds.pop()!))
})

async function makeAdmission() {
  const db = getDb()
  const [patientRow] = await db.select().from(patients).limit(1)
  const [room] = await db.insert(rooms).values({ ward: 'Test Ward', roomNumber: 'AM1', bedNumber: 'A' }).returning()
  createdRoomIds.push(room.id)
  const [providerRow] = await db.select().from(providers).limit(1)
  const [admission] = await db.insert(admissions).values({ patientId: patientRow.id, currentRoomId: room.id, attendingProviderId: providerRow.id }).returning()
  createdAdmissionIds.push(admission.id)
  return admission
}

describe('POST /api/inpatient/admissions/[id]/medications', () => {
  it('orders a medication for the admission', async () => {
    const admission = await makeAdmission()
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ medicationName: 'Sertraline', dose: '100mg', scheduledFor: new Date().toISOString() }) })
    const res = await orderRoute(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(201)
    const body = await res.json()
    createdMarIds.push(body.id)
    expect(body.status).toBe('scheduled')
  })

  it('rejects a frontdesk session', async () => {
    sessionRole = 'frontdesk'
    const admission = await makeAdmission()
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ medicationName: 'Sertraline', dose: '100mg', scheduledFor: new Date().toISOString() }) })
    const res = await orderRoute(req as never, { params: Promise.resolve({ id: String(admission.id) }) })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/inpatient/admissions/[id]/medications/[medId]/administer', () => {
  it('records a given dose', async () => {
    const admission = await makeAdmission()
    const orderReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ medicationName: 'Sertraline', dose: '100mg', scheduledFor: new Date().toISOString() }) })
    const orderRes = await orderRoute(orderReq as never, { params: Promise.resolve({ id: String(admission.id) }) })
    const ordered = await orderRes.json()
    createdMarIds.push(ordered.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ status: 'given' }) })
    const res = await administerRoute(req as never, { params: Promise.resolve({ id: String(admission.id), medId: String(ordered.id) }) })
    expect(res.status).toBe(200)
  })

  it('rejects a held status with no notes', async () => {
    const admission = await makeAdmission()
    const orderReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ medicationName: 'Lorazepam', dose: '1mg', scheduledFor: new Date().toISOString() }) })
    const orderRes = await orderRoute(orderReq as never, { params: Promise.resolve({ id: String(admission.id) }) })
    const ordered = await orderRes.json()
    createdMarIds.push(ordered.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ status: 'held' }) })
    const res = await administerRoute(req as never, { params: Promise.resolve({ id: String(admission.id), medId: String(ordered.id) }) })
    expect(res.status).toBe(400)
  })

  it('rejects administering a medication through a different admission\'s URL than the one it was ordered under', async () => {
    const admissionA = await makeAdmission()
    const admissionB = await makeAdmission()
    const orderReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ medicationName: 'Sertraline', dose: '100mg', scheduledFor: new Date().toISOString() }) })
    const orderRes = await orderRoute(orderReq as never, { params: Promise.resolve({ id: String(admissionA.id) }) })
    const ordered = await orderRes.json()
    createdMarIds.push(ordered.id)

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ status: 'given' }) })
    const res = await administerRoute(req as never, { params: Promise.resolve({ id: String(admissionB.id), medId: String(ordered.id) }) })
    expect(res.status).toBe(409)
  })
})

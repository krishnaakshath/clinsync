import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { rooms, providers, patients, admissions } from '@/db/schema'
import { createAdmission, getActiveAdmissionForPatient, getAdmissionById } from '@/lib/queries/admissions'

const createdRoomIds: number[] = []
const createdAdmissionIds: number[] = []
afterEach(async () => {
  while (createdAdmissionIds.length > 0) await getDb().delete(admissions).where(eq(admissions.id, createdAdmissionIds.pop()!))
  while (createdRoomIds.length > 0) await getDb().delete(rooms).where(eq(rooms.id, createdRoomIds.pop()!))
})

describe('admissions queries', () => {
  it('creates an admission with a room and reads it back as the active one', async () => {
    const db = getDb()
    const [room] = await db.insert(rooms).values({ ward: 'Test Ward', roomNumber: 'Q1', bedNumber: 'A' }).returning()
    createdRoomIds.push(room.id)
    const [providerRow] = await db.select().from(providers).limit(1)
    const [patientRow] = await db.select().from(patients).limit(1)

    const created = await createAdmission({ patientId: patientRow.id, roomId: room.id, attendingProviderId: providerRow.id, admissionType: 'elective', createdFromAssignmentId: null })
    createdAdmissionIds.push(created.id)
    expect(created.currentRoomId).toBe(room.id)
    expect(created.status).toBe('admitted')

    const active = await getActiveAdmissionForPatient(patientRow.id)
    expect(active?.id).toBe(created.id)

    const byId = await getAdmissionById(created.id)
    expect(byId?.id).toBe(created.id)
  })

  it('creates a boarding admission with no room (roomId: null)', async () => {
    const db = getDb()
    const [providerRow] = await db.select().from(providers).limit(1)
    const [patientRow] = await db.select().from(patients).limit(1)
    const created = await createAdmission({ patientId: patientRow.id, roomId: null, attendingProviderId: providerRow.id, admissionType: 'emergency', createdFromAssignmentId: null })
    createdAdmissionIds.push(created.id)
    expect(created.currentRoomId).toBeNull()
  })

  it('returns null from getActiveAdmissionForPatient when the patient has no active admission', async () => {
    const db = getDb()
    const [patientRow] = await db.select().from(patients).limit(1)
    // Use a patient with a discharged-only history or none at all -- since
    // this test doesn't create any admission for this patient, "no active
    // admission" is trivially true here.
    const active = await getActiveAdmissionForPatient(patientRow.id + '-no-such-suffix')
    expect(active).toBeNull()
  })
})

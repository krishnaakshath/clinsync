import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { rooms, providers, patients, admissions, admissionTransfers } from '@/db/schema'
import { deletePatient } from '@/lib/queries/patients'

describe('deletePatient — admissions cleanup', () => {
  it('deletes admissionTransfers and admissions for the patient, and does not leave an FK violation', async () => {
    const db = getDb()
    const [room1] = await db.insert(rooms).values({ ward: 'Test Ward', roomNumber: 'D1', bedNumber: 'A' }).returning()
    const [room2] = await db.insert(rooms).values({ ward: 'Test Ward', roomNumber: 'D2', bedNumber: 'A' }).returning()
    const [providerRow] = await db.select().from(providers).limit(1)

    const testPatientId = `TEST-DEL-${Date.now()}`
    await db.insert(patients).values({ id: testPatientId, intakeqClientIdRef: 'ENC[test]', nameIntakeq: 'Delete Test Patient', dobIntakeq: '2000-01-01' })

    const [admission] = await db.insert(admissions).values({ patientId: testPatientId, currentRoomId: room1.id, attendingProviderId: providerRow.id }).returning()
    await db.insert(admissionTransfers).values({ admissionId: admission.id, fromRoomId: room1.id, toRoomId: room2.id, reason: 'Test', transferredByName: 'Test Nurse' })

    const deleted = await deletePatient(testPatientId)
    expect(deleted).toBe(true)

    const remainingAdmissions = await db.select().from(admissions).where(eq(admissions.patientId, testPatientId))
    expect(remainingAdmissions.length).toBe(0)

    await db.delete(rooms).where(eq(rooms.id, room1.id))
    await db.delete(rooms).where(eq(rooms.id, room2.id))
  })
})

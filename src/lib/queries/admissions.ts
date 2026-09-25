import { getDb } from '@/db/client'
import { admissions, admissionTransfers } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'

export type Admission = typeof admissions.$inferSelect

export interface CreateAdmissionInput {
  patientId: string
  roomId: number | null
  attendingProviderId: number
  admissionType: 'elective' | 'emergency' | 'transfer_in'
  createdFromAssignmentId: number | null
}

export async function createAdmission(input: CreateAdmissionInput): Promise<Admission> {
  const [created] = await getDb().insert(admissions).values({
    patientId: input.patientId,
    currentRoomId: input.roomId,
    attendingProviderId: input.attendingProviderId,
    admissionType: input.admissionType,
    createdFromAssignmentId: input.createdFromAssignmentId,
  }).returning()
  return created
}

// Only one admission can be "active" for a patient at a time -- this is how
// the check-in route (below) avoids double-admitting a patient who's already
// an inpatient. Ordered by admittedAt desc as a defensive tie-breaker; in
// practice there should only ever be zero or one matching row.
export async function getActiveAdmissionForPatient(patientId: string): Promise<Admission | null> {
  const [row] = await getDb().select().from(admissions).where(and(eq(admissions.patientId, patientId), eq(admissions.status, 'admitted'))).orderBy(desc(admissions.admittedAt)).limit(1)
  return row ?? null
}

export async function getAdmissionById(id: number): Promise<Admission | null> {
  const [row] = await getDb().select().from(admissions).where(eq(admissions.id, id))
  return row ?? null
}

export interface AdmissionTransferRecord {
  id: number
  fromRoomId: number | null
  toRoomId: number
  reason: string
  transferredByName: string
  transferredAt: Date
}

export interface AdmissionWithTransfers extends Admission {
  transfers: AdmissionTransferRecord[]
}

// Newest admission first, each with its own transfer history (also newest
// first) -- exactly the shape the Patient Detail "Inpatient History" tab
// (Task 6) renders directly with no further reshaping.
export async function listAdmissionsForPatient(patientId: string): Promise<AdmissionWithTransfers[]> {
  const db = getDb()
  const admissionRows = await db.select().from(admissions).where(eq(admissions.patientId, patientId)).orderBy(desc(admissions.admittedAt))
  const result: AdmissionWithTransfers[] = []
  for (const admission of admissionRows) {
    const transfers = await db.select().from(admissionTransfers).where(eq(admissionTransfers.admissionId, admission.id)).orderBy(desc(admissionTransfers.transferredAt))
    result.push({ ...admission, transfers })
  }
  return result
}

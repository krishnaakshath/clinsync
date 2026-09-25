import { getDb } from '@/db/client'
import { admissions, admissionTransfers, rooms } from '@/db/schema'
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

export interface TransferResult {
  ok: boolean
  error?: string
}

// Sequential, not transactional (the neon-http driver doesn't support
// multi-statement transactions -- same accepted limitation as Front Desk).
// Order matters for safety: claim the destination room FIRST (race-safe,
// conditional on it still being available), and only free the old room and
// update the admission after that succeeds. If the process died between
// steps, the failure mode is "new room occupied, old room still occupied
// too" -- an inconsistency a human can see and fix -- never "old room freed
// but nobody actually holds the new one."
export async function transferAdmission(admissionId: number, toRoomId: number, reason: string, transferredByName: string): Promise<TransferResult> {
  const db = getDb()
  const admission = await getAdmissionById(admissionId)
  if (!admission) return { ok: false, error: 'Admission not found' }
  if (admission.status !== 'admitted') return { ok: false, error: 'This admission has already been discharged' }

  const claimed = await db.update(rooms).set({ status: 'occupied', occupiedByPatientId: admission.patientId }).where(and(eq(rooms.id, toRoomId), eq(rooms.status, 'available'))).returning({ id: rooms.id })
  if (claimed.length === 0) return { ok: false, error: 'That room is no longer available. Please choose another.' }

  const fromRoomId = admission.currentRoomId
  if (fromRoomId !== null) {
    await db.update(rooms).set({ status: 'dirty', occupiedByPatientId: null }).where(eq(rooms.id, fromRoomId))
  }

  await db.update(admissions).set({ currentRoomId: toRoomId }).where(eq(admissions.id, admissionId))
  await db.insert(admissionTransfers).values({ admissionId, fromRoomId, toRoomId, reason, transferredByName })

  return { ok: true }
}

import { getDb } from '@/db/client'
import { doctorAssignments } from '@/db/schema'

export interface CreateDoctorAssignmentInput {
  patientId: string
  providerId: number
  visitType: 'inpatient' | 'outpatient'
  urgency: 'routine' | 'urgent' | 'emergency'
  reason: string
  roomId: number | null
  assignedByName: string
}

export type DoctorAssignmentRow = typeof doctorAssignments.$inferSelect

export async function createDoctorAssignment(input: CreateDoctorAssignmentInput): Promise<DoctorAssignmentRow> {
  const [created] = await getDb().insert(doctorAssignments).values(input).returning()
  return created
}

// (`listPendingAssignmentsForProvider`, `scheduleAssignment`, and
// `declineAssignment` are added to this same file in Task 4, which owns the
// doctor-side half of this table's lifecycle.)

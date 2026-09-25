import { getDb } from '@/db/client'
import { doctorAssignments } from '@/db/schema'
import { and, desc, eq, gte } from 'drizzle-orm'

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

export async function listPendingAssignmentsForProvider(providerId: number): Promise<DoctorAssignmentRow[]> {
  return getDb()
    .select()
    .from(doctorAssignments)
    .where(and(eq(doctorAssignments.providerId, providerId), eq(doctorAssignments.status, 'pending')))
}

export async function scheduleAssignment(assignmentId: number, appointmentId: number): Promise<DoctorAssignmentRow | null> {
  const [updated] = await getDb()
    .update(doctorAssignments)
    .set({ status: 'scheduled', appointmentId })
    .where(eq(doctorAssignments.id, assignmentId))
    .returning()
  return updated ?? null
}

export async function declineAssignment(assignmentId: number, reason: string): Promise<DoctorAssignmentRow | null> {
  const [updated] = await getDb()
    .update(doctorAssignments)
    .set({ status: 'declined', declineReason: reason })
    .where(eq(doctorAssignments.id, assignmentId))
    .returning()
  return updated ?? null
}

export async function listAllAssignments(): Promise<DoctorAssignmentRow[]> {
  return getDb().select().from(doctorAssignments).orderBy(desc(doctorAssignments.createdAt))
}

/**
 * Restricts the KPI/queue view to assignments created today (calendar day,
 * server-local time) -- listAllAssignments() itself is intentionally left
 * alone since /front-desk/assignments shows the full history, not just
 * today.
 */
export async function listTodaysAssignments(): Promise<DoctorAssignmentRow[]> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return getDb()
    .select()
    .from(doctorAssignments)
    .where(gte(doctorAssignments.createdAt, startOfToday))
    .orderBy(desc(doctorAssignments.createdAt))
}

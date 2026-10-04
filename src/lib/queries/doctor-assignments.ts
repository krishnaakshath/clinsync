import { getDb } from '@/db/client'
import { doctorAssignments, patients } from '@/db/schema'
import { and, asc, desc, eq, getTableColumns, gte, isNull, sql } from 'drizzle-orm'
import { getNextQueueTicketNumberForToday } from './queue-tickets'

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
  const queueTicketNumber = await getNextQueueTicketNumberForToday()
  const [created] = await getDb().insert(doctorAssignments).values({ ...input, queueTicketNumber }).returning()
  return created
}

export type PendingAssignmentRow = DoctorAssignmentRow & { patientName: string }

export async function listPendingAssignmentsForProvider(providerId: number): Promise<PendingAssignmentRow[]> {
  return getDb()
    .select({ ...getTableColumns(doctorAssignments), patientName: patients.name })
    .from(doctorAssignments)
    .innerJoin(patients, eq(patients.id, doctorAssignments.patientId))
    .where(and(eq(doctorAssignments.providerId, providerId), eq(doctorAssignments.status, 'pending')))
    .orderBy(
      sql`CASE ${doctorAssignments.urgency} WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END`,
      asc(doctorAssignments.createdAt),
      asc(doctorAssignments.id),
    )
}

export async function countPendingAssignmentsForProvider(providerId: number): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(doctorAssignments)
    .where(and(eq(doctorAssignments.providerId, providerId), eq(doctorAssignments.status, 'pending')))
  return row?.count ?? 0
}

export async function countUnacknowledgedDeclines(): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(doctorAssignments)
    .where(and(eq(doctorAssignments.status, 'declined'), isNull(doctorAssignments.declineAcknowledgedAt)))
  return row?.count ?? 0
}

export async function acknowledgeDecline(assignmentId: number, acknowledgedByName: string): Promise<DoctorAssignmentRow | null> {
  const [updated] = await getDb()
    .update(doctorAssignments)
    .set({ declineAcknowledgedAt: new Date(), declineAcknowledgedByName: acknowledgedByName })
    .where(and(eq(doctorAssignments.id, assignmentId), eq(doctorAssignments.status, 'declined'), isNull(doctorAssignments.declineAcknowledgedAt)))
    .returning()
  return updated ?? null
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
  return getDb()
    .select()
    .from(doctorAssignments)
    .orderBy(
      sql`CASE WHEN ${doctorAssignments.status} = 'declined' AND ${doctorAssignments.declineAcknowledgedAt} IS NULL THEN 0 ELSE 1 END`,
      desc(doctorAssignments.createdAt),
    )
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

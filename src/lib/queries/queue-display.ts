import { getDb } from '@/db/client'
import { doctorAssignments, appointments, admissions } from '@/db/schema'
import { and, eq, gte, ne } from 'drizzle-orm'

export type QueueDisplayStage = 'waiting' | 'ready'

export interface QueueDisplayRow {
  ticketNumber: number
  urgency: 'routine' | 'urgent' | 'emergency'
  stage: QueueDisplayStage
}

function startOfToday(): Date {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start
}

// Reuses doctorAssignments/rooms/admissions/appointments -- no new status
// enum (spec §4). Scoped to "today" (see this plan's "Scope decisions" #2).
export async function getQueueDisplayRows(): Promise<QueueDisplayRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      queueTicketNumber: doctorAssignments.queueTicketNumber,
      urgency: doctorAssignments.urgency,
      status: doctorAssignments.status,
      roomId: doctorAssignments.roomId,
      appointmentStatus: appointments.status,
      admissionId: admissions.id,
    })
    .from(doctorAssignments)
    .leftJoin(appointments, eq(doctorAssignments.appointmentId, appointments.id))
    .leftJoin(admissions, eq(admissions.createdFromAssignmentId, doctorAssignments.id))
    .where(and(gte(doctorAssignments.createdAt, startOfToday()), ne(doctorAssignments.status, 'declined')))

  const result: QueueDisplayRow[] = []
  for (const row of rows) {
    if (row.admissionId !== null) continue // already admitted -- no longer waiting in the lobby
    if (row.appointmentStatus === 'completed') continue // visit already happened
    if (row.status === 'pending') {
      result.push({ ticketNumber: row.queueTicketNumber, urgency: row.urgency, stage: 'waiting' })
    } else if (row.status === 'scheduled' && row.roomId !== null) {
      result.push({ ticketNumber: row.queueTicketNumber, urgency: row.urgency, stage: 'ready' })
    }
    // 'scheduled' with no roomId has no bucket here -- see "Scope decisions" #3.
  }
  return result.sort((a, b) => a.ticketNumber - b.ticketNumber)
}

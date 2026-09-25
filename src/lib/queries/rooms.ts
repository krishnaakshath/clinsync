import { getDb } from '@/db/client'
import { rooms } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

export interface AvailableRoom {
  id: number
  ward: string
  roomNumber: string
  bedNumber: string
}

export async function listAvailableRooms(): Promise<AvailableRoom[]> {
  return getDb()
    .select({ id: rooms.id, ward: rooms.ward, roomNumber: rooms.roomNumber, bedNumber: rooms.bedNumber })
    .from(rooms)
    .where(eq(rooms.status, 'available'))
}

/**
 * Race-safe: the UPDATE's WHERE clause re-checks `status = 'available'` at
 * write time, not just at the earlier read time a caller may have done. Two
 * concurrent check-ins racing for the same room can both pass a read-time
 * check, but only one UPDATE actually matches a row here -- the loser's
 * `.rowCount` is 0, which this function surfaces as `false` so the route can
 * tell the operator "someone else just took that room" instead of silently
 * double-booking it.
 */
export async function assignRoomToPatient(roomId: number, patientId: string): Promise<boolean> {
  const result = await getDb()
    .update(rooms)
    .set({ status: 'occupied', occupiedByPatientId: patientId })
    .where(and(eq(rooms.id, roomId), eq(rooms.status, 'available')))
    .returning({ id: rooms.id })
  return result.length > 0
}

import { randomBytes } from 'crypto'
import { and, eq, ne, notInArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appointments, telemedicineSessions } from '@/db/schema'

export type TelemedicineSessionStatus = 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'failed'

export interface TelemedicineSessionRow {
  id: number
  appointmentId: number
  appointmentProviderId: number
  appointmentPatientId: string
  patientJoinToken: string
  status: TelemedicineSessionStatus
  providerJoinedAt: Date | null
  patientJoinedAt: Date | null
  endedAt: Date | null
  createdAt: Date
}

function mapRow(r: { session: typeof telemedicineSessions.$inferSelect; appointment: typeof appointments.$inferSelect }): TelemedicineSessionRow {
  return {
    id: r.session.id,
    appointmentId: r.session.appointmentId,
    appointmentProviderId: r.appointment.providerId,
    appointmentPatientId: r.appointment.patientId,
    patientJoinToken: r.session.patientJoinToken,
    status: r.session.status,
    providerJoinedAt: r.session.providerJoinedAt,
    patientJoinedAt: r.session.patientJoinedAt,
    endedAt: r.session.endedAt,
    createdAt: r.session.createdAt,
  }
}

export async function getSessionById(id: number): Promise<TelemedicineSessionRow | null> {
  const [row] = await getDb()
    .select({ session: telemedicineSessions, appointment: appointments })
    .from(telemedicineSessions)
    .innerJoin(appointments, eq(telemedicineSessions.appointmentId, appointments.id))
    .where(eq(telemedicineSessions.id, id))
  return row ? mapRow(row) : null
}

export async function getSessionByToken(token: string): Promise<TelemedicineSessionRow | null> {
  const [row] = await getDb()
    .select({ session: telemedicineSessions, appointment: appointments })
    .from(telemedicineSessions)
    .innerJoin(appointments, eq(telemedicineSessions.appointmentId, appointments.id))
    .where(eq(telemedicineSessions.patientJoinToken, token))
  return row ? mapRow(row) : null
}

export async function createTelemedicineSession(appointmentId: number): Promise<{ ok: boolean; error?: string; session?: TelemedicineSessionRow }> {
  const [existing] = await getDb().select().from(telemedicineSessions).where(eq(telemedicineSessions.appointmentId, appointmentId))
  if (existing) return { ok: false, error: 'A telemedicine session already exists for this appointment' }

  const patientJoinToken = randomBytes(32).toString('base64url')
  const [created] = await getDb().insert(telemedicineSessions).values({ appointmentId, patientJoinToken }).returning()

  const session = await getSessionById(created.id)
  return { ok: true, session: session! }
}

export async function markProviderJoined(sessionId: number): Promise<void> {
  await getDb().update(telemedicineSessions)
    .set({
      providerJoinedAt: sql`COALESCE(${telemedicineSessions.providerJoinedAt}, now())`,
      status: sql`CASE WHEN ${telemedicineSessions.status} = 'scheduled' THEN 'waiting'::telemedicine_session_status ELSE ${telemedicineSessions.status} END`,
    })
    .where(and(eq(telemedicineSessions.id, sessionId), notInArray(telemedicineSessions.status, ['completed', 'failed'])))
}

export async function markPatientJoined(sessionId: number): Promise<void> {
  await getDb().update(telemedicineSessions)
    .set({
      patientJoinedAt: sql`COALESCE(${telemedicineSessions.patientJoinedAt}, now())`,
      status: sql`CASE WHEN ${telemedicineSessions.status} = 'waiting' AND ${telemedicineSessions.providerJoinedAt} IS NOT NULL THEN 'in_progress'::telemedicine_session_status ELSE ${telemedicineSessions.status} END`,
    })
    .where(and(eq(telemedicineSessions.id, sessionId), notInArray(telemedicineSessions.status, ['completed', 'failed'])))
}

export async function endSession(sessionId: number): Promise<{ ok: boolean; error?: string }> {
  const updated = await getDb().update(telemedicineSessions)
    .set({ status: 'completed', endedAt: new Date() })
    .where(and(eq(telemedicineSessions.id, sessionId), ne(telemedicineSessions.status, 'completed')))
    .returning({ id: telemedicineSessions.id })

  if (updated.length === 0) return { ok: false, error: 'Session already ended' }
  return { ok: true }
}

import { getDb } from '@/db/client'
import { appointments, patients, providers } from '@/db/schema'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { TebraAppointment } from '@/connectors/types'

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface AppointmentWithDetails {
  id: number
  patientId: string
  patientName: string
  providerId: number
  providerName: string
  providerColorTag: string
  startsAt: Date
  endsAt: Date
  visitReason: string
  status: AppointmentStatus
  notes: string | null
}

function mapAppointmentRow(r: { appointment: typeof appointments.$inferSelect; patient: typeof patients.$inferSelect; provider: typeof providers.$inferSelect }): AppointmentWithDetails {
  return {
    id: r.appointment.id,
    patientId: r.appointment.patientId,
    patientName: r.patient.nameTebra ?? r.patient.nameIntakeq ?? r.patient.name,
    providerId: r.appointment.providerId,
    providerName: r.provider.name,
    providerColorTag: r.provider.colorTag,
    startsAt: r.appointment.startsAt,
    endsAt: r.appointment.endsAt,
    visitReason: r.appointment.visitReason,
    status: r.appointment.status,
    notes: r.appointment.notes,
  }
}

/**
 * `providerIds === undefined` means "no provider filter" (all providers).
 * `providerIds === []` means the caller explicitly deselected every
 * provider (the calendar's "Uncheck All") — that must return zero
 * appointments, not fall back to "no filter", so it's short-circuited
 * before the query is built.
 */
export async function listAppointmentsInRange(start: Date, end: Date, providerIds?: number[]): Promise<AppointmentWithDetails[]> {
  if (providerIds && providerIds.length === 0) return []

  const conditions = [gte(appointments.startsAt, start), lte(appointments.startsAt, end)]
  if (providerIds && providerIds.length > 0) conditions.push(inArray(appointments.providerId, providerIds))

  const rows = await getDb()
    .select({ appointment: appointments, patient: patients, provider: providers })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(providers, eq(appointments.providerId, providers.id))
    .where(and(...conditions))
    .orderBy(asc(appointments.startsAt))

  return rows.map(mapAppointmentRow)
}

export async function listUpcomingAppointments(limit: number): Promise<AppointmentWithDetails[]> {
  const rows = await getDb()
    .select({ appointment: appointments, patient: patients, provider: providers })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(providers, eq(appointments.providerId, providers.id))
    .where(and(gte(appointments.startsAt, new Date()), eq(appointments.status, 'scheduled')))
    .orderBy(asc(appointments.startsAt))
    .limit(limit)

  return rows.map(mapAppointmentRow)
}

export async function getAppointment(id: number): Promise<AppointmentWithDetails | null> {
  const [row] = await getDb()
    .select({ appointment: appointments, patient: patients, provider: providers })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(providers, eq(appointments.providerId, providers.id))
    .where(eq(appointments.id, id))
  return row ? mapAppointmentRow(row) : null
}

/**
 * Upserts an appointment synced from Tebra, matched on `tebraId` -- inserts
 * if absent, updates if present. Never touches a `source: 'clinsync'` row:
 * the unique index on `tebraId` (Task 1) is partial (`WHERE tebra_id IS NOT
 * NULL`), so `ON CONFLICT` inference needs `targetWhere` to match that
 * predicate (see `upsertProviderFromTebra`'s comment for the full
 * reasoning) -- a clinsync-origin appointment always has `tebraId: null`,
 * so it can never be the row Postgres finds conflicting here.
 *
 * `TebraAppointment.providerId` is Tebra's own provider id (a string) --
 * resolved here to our internal serial `providers.id` via the
 * `providers.tebraId` column `upsertProviderFromTebra` populates (providers
 * sync as daily reference data, ahead of this entity's more frequent pull,
 * so the lookup should normally hit; this throws rather than silently
 * dropping the appointment if it doesn't, since `providerId` is a NOT NULL
 * FK). `patientId` is passed straight through: `TebraAppointment.patientId`
 * and `patients.id` are both plain text, and resolving a raw Tebra patient
 * id into Clinsync's own anonymised patient id is the sync orchestrator's
 * job (a later task), not this function's.
 */
export async function upsertAppointmentFromTebra(data: TebraAppointment): Promise<void> {
  const db = getDb()
  const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.tebraId, data.providerId))
  if (!provider) {
    throw new Error(`upsertAppointmentFromTebra: no provider found for Tebra providerId "${data.providerId}" -- sync providers before appointments`)
  }

  await db
    .insert(appointments)
    .values({
      patientId: data.patientId,
      providerId: provider.id,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      visitReason: data.visitReason,
      status: data.status,
      source: 'tebra',
      tebraId: data.tebraId,
    })
    .onConflictDoUpdate({
      target: [appointments.tebraId],
      targetWhere: sql`${appointments.tebraId} is not null`,
      set: {
        patientId: data.patientId,
        providerId: provider.id,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        visitReason: data.visitReason,
        status: data.status,
      },
    })
}

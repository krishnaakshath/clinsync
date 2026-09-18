import { getDb } from '@/db/client'
import { charges, patients } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, chargesListCacheKey, chargeDetailCacheKey } from '@/lib/cache'

// Re-exported for existing importers -- the actual definitions live in the
// DB-free src/lib/charge-status.ts so client components (ChargesTable) can
// import the real workflow logic too, instead of hand-maintaining a copy.
export { type ChargeStatus, isAllowedChargeTransition } from '@/lib/charge-status'
import type { ChargeStatus } from '@/lib/charge-status'

export interface DiagnosisCodeInput { code: string; description: string }
export interface ProcedureCodeInput { code: string; description: string; units: number; chargeCents: number }

export interface CreateChargeInput {
  patientId: string
  providerName: string
  dateOfService: string
  diagnosisCodes: DiagnosisCodeInput[]
  procedureCodes: ProcedureCodeInput[]
  amountCents: number
  notes?: string
}

export async function listCharges() {
  return getOrSetCache(chargesListCacheKey(), 30, async () => {
    const rows = await getDb()
      .select({ charge: charges, patient: patients })
      .from(charges)
      .innerJoin(patients, eq(charges.patientId, patients.id))
      .orderBy(desc(charges.dateOfService))
    return rows.map((r) => ({ ...r.charge, patientName: r.patient.nameTebra ?? r.patient.nameIntakeq }))
  })
}

export async function getCharge(id: number) {
  return getOrSetCache(chargeDetailCacheKey(id), 30, async () => {
    const [row] = await getDb()
      .select({ charge: charges, patient: patients })
      .from(charges)
      .innerJoin(patients, eq(charges.patientId, patients.id))
      .where(eq(charges.id, id))
    if (!row) return null
    return {
      ...row.charge,
      patientName: row.patient.nameTebra ?? row.patient.nameIntakeq,
      patientDob: row.patient.dobTebra ?? row.patient.dobIntakeq,
    }
  })
}

export async function createCharge(input: CreateChargeInput) {
  const [created] = await getDb().insert(charges).values({ ...input, status: 'draft' }).returning()
  await invalidateChargesList()
  return created
}

export async function updateChargeStatus(id: number, status: ChargeStatus) {
  await getDb().update(charges).set({ status }).where(eq(charges.id, id))
  await invalidateChargesList()
  await invalidateCache(chargeDetailCacheKey(id))
}

export async function invalidateChargesList() {
  await invalidateCache(chargesListCacheKey())
}

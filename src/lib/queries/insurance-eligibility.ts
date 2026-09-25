import { createHash } from 'crypto'
import { getDb } from '@/db/client'
import { insuranceEligibilityChecks } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export type InsuranceEligibilityCheckRow = typeof insuranceEligibilityChecks.$inferSelect

const STATUSES = ['verified', 'inactive', 'needs_follow_up'] as const

/**
 * Deterministic simulation, same technique as
 * src/lib/queries/broadcasts.ts's simulateBroadcastDelivery -- there is no
 * real payer/clearinghouse contract behind this (same honest-mock
 * discipline as the Tebra/IntakeQ connectors), so the result is derived
 * from a hash of the input rather than randomness, which makes it testable
 * and stable for the same patient+payer pair every time it's re-checked.
 */
export function simulateEligibilityCheck(patientId: string, payerName: string): { status: typeof STATUSES[number]; copayCents: number | null } {
  const hash = createHash('sha256').update(`${patientId}:${payerName.toLowerCase().trim()}`).digest()
  const status = STATUSES[hash[0] % STATUSES.length]
  const copayCents = status === 'verified' ? (hash[1] % 10) * 500 : null // $0-$45 in $5 steps
  return { status, copayCents }
}

export interface RecordEligibilityCheckInput {
  patientId: string
  payerName: string
  status: typeof STATUSES[number]
  copayCents: number | null
  checkedByName: string
}

export async function recordEligibilityCheck(input: RecordEligibilityCheckInput): Promise<InsuranceEligibilityCheckRow> {
  const [created] = await getDb().insert(insuranceEligibilityChecks).values(input).returning()
  return created
}

export async function getLatestEligibilityCheck(patientId: string): Promise<InsuranceEligibilityCheckRow | null> {
  const [row] = await getDb()
    .select()
    .from(insuranceEligibilityChecks)
    .where(eq(insuranceEligibilityChecks.patientId, patientId))
    .orderBy(desc(insuranceEligibilityChecks.checkedAt))
    .limit(1)
  return row ?? null
}

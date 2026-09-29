import { getDb } from '@/db/client'
import { labOrders, labResults, labTests, patients, providers } from '@/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'

export interface CreateLabOrderInput {
  patientId: string
  labTestId: number
  orderedByProviderId: number
}

export async function createLabOrder(input: CreateLabOrderInput) {
  const [created] = await getDb().insert(labOrders).values({
    patientId: input.patientId,
    labTestId: input.labTestId,
    orderedByProviderId: input.orderedByProviderId,
  }).returning()
  return created
}

type LifecycleResult = { ok: true; patientId: string } | { ok: false; error: string }

/**
 * Single conditional UPDATE keyed on current status (`ordered` only) — an
 * affected-row-count of 0 means the order either doesn't exist or is
 * already past `ordered`, both of which are "not collectible right now"
 * from the caller's point of view (Review Focus #2: a second call on an
 * already-`collected` order must not re-stamp `collectedAt`).
 */
export async function markCollected(orderId: number): Promise<LifecycleResult> {
  const updated = await getDb().update(labOrders)
    .set({ status: 'collected', collectedAt: new Date() })
    .where(and(eq(labOrders.id, orderId), eq(labOrders.status, 'ordered')))
    .returning({ id: labOrders.id, patientId: labOrders.patientId })
  if (updated.length === 0) return { ok: false, error: 'Order is not in ordered status' }
  return { ok: true, patientId: updated[0].patientId }
}

export interface EnterResultInput {
  value: string
  unit?: string
  referenceRange?: string
  flag: 'normal' | 'abnormal' | 'critical'
  notes?: string
  resultedByName: string
}

/**
 * Guards the `collected -> resulted` transition in the UPDATE's WHERE
 * clause and only inserts the `labResults` row once that UPDATE has
 * actually affected a row (Review Focus #1: a result can never be entered
 * against an order that hasn't been collected — the row simply won't be
 * there to attach a result to).
 */
export async function enterResult(orderId: number, input: EnterResultInput): Promise<LifecycleResult> {
  const updated = await getDb().update(labOrders)
    .set({ status: 'resulted' })
    .where(and(eq(labOrders.id, orderId), eq(labOrders.status, 'collected')))
    .returning({ id: labOrders.id, patientId: labOrders.patientId })
  if (updated.length === 0) return { ok: false, error: 'Order is not in collected status' }

  await getDb().insert(labResults).values({
    labOrderId: orderId,
    value: input.value,
    unit: input.unit ?? null,
    referenceRange: input.referenceRange ?? null,
    flag: input.flag,
    resultedByName: input.resultedByName,
    notes: input.notes ?? null,
  })

  return { ok: true, patientId: updated[0].patientId }
}

/**
 * `cancelOrder` guards `status IN ('ordered', 'collected')` — both
 * non-terminal states — in its WHERE, rejecting `resulted` and
 * `cancelled` alike (Review Focus #3: cancelling a terminal-state order,
 * whether already resulted or already cancelled, must fail).
 *
 * `reason` isn't stored on `labOrders` (no such column on this schema —
 * Task 1's approved shape has no cancel-reason field), so it's validated
 * here for defense in depth and left for the calling route to fold into
 * `logAudit`'s free-text action, the same place other unstored-but-required
 * context (e.g. discharge/transfer notes) ends up in this codebase when
 * there's no dedicated column for it.
 */
export async function cancelOrder(orderId: number, reason: string): Promise<LifecycleResult> {
  if (!reason || !reason.trim()) return { ok: false, error: 'A reason is required to cancel an order' }

  const updated = await getDb().update(labOrders)
    .set({ status: 'cancelled' })
    .where(and(eq(labOrders.id, orderId), inArray(labOrders.status, ['ordered', 'collected'])))
    .returning({ id: labOrders.id, patientId: labOrders.patientId })
  if (updated.length === 0) return { ok: false, error: 'Order is not in a cancellable status' }
  return { ok: true, patientId: updated[0].patientId }
}

export interface PatientLabOrderRow {
  id: number
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled'
  orderedAt: Date
  collectedAt: Date | null
  testId: number
  testName: string
  testCode: string
  defaultUnit: string | null
  referenceRange: string | null
  result: {
    value: string
    unit: string | null
    referenceRange: string | null
    flag: 'normal' | 'abnormal' | 'critical'
    resultedByName: string
    resultedAt: Date
    notes: string | null
  } | null
}

function mapPatientOrderRow(r: {
  order: typeof labOrders.$inferSelect
  test: typeof labTests.$inferSelect
  result: typeof labResults.$inferSelect | null
}): PatientLabOrderRow {
  return {
    id: r.order.id,
    status: r.order.status,
    orderedAt: r.order.orderedAt,
    collectedAt: r.order.collectedAt,
    testId: r.test.id,
    testName: r.test.name,
    testCode: r.test.code,
    defaultUnit: r.test.defaultUnit,
    referenceRange: r.test.referenceRange,
    result: r.result ? {
      value: r.result.value,
      unit: r.result.unit,
      referenceRange: r.result.referenceRange,
      flag: r.result.flag,
      resultedByName: r.result.resultedByName,
      resultedAt: r.result.resultedAt,
      notes: r.result.notes,
    } : null,
  }
}

/** A single patient's lab history, newest order first — independent of any other patient's (see the patient-scoping test). */
export async function listOrdersForPatient(patientId: string): Promise<PatientLabOrderRow[]> {
  const rows = await getDb()
    .select({ order: labOrders, test: labTests, result: labResults })
    .from(labOrders)
    .innerJoin(labTests, eq(labOrders.labTestId, labTests.id))
    .leftJoin(labResults, eq(labResults.labOrderId, labOrders.id))
    .where(eq(labOrders.patientId, patientId))
    .orderBy(desc(labOrders.orderedAt))

  return rows.map(mapPatientOrderRow)
}

export interface WorklistRow {
  id: number
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled'
  orderedAt: Date
  collectedAt: Date | null
  patientId: string
  patientName: string
  testId: number
  testName: string
  testCode: string
  orderedByProviderId: number
  orderedByProviderName: string
}

function mapWorklistRow(r: {
  order: typeof labOrders.$inferSelect
  test: typeof labTests.$inferSelect
  patient: typeof patients.$inferSelect
  provider: typeof providers.$inferSelect
}): WorklistRow {
  return {
    id: r.order.id,
    status: r.order.status,
    orderedAt: r.order.orderedAt,
    collectedAt: r.order.collectedAt,
    patientId: r.order.patientId,
    patientName: r.patient.name,
    testId: r.test.id,
    testName: r.test.name,
    testCode: r.test.code,
    orderedByProviderId: r.order.orderedByProviderId,
    orderedByProviderName: r.provider.name,
  }
}

/** All orders across all patients, newest first, joined for display on the worklist screen. */
export async function listWorklist(): Promise<WorklistRow[]> {
  const rows = await getDb()
    .select({ order: labOrders, test: labTests, patient: patients, provider: providers })
    .from(labOrders)
    .innerJoin(labTests, eq(labOrders.labTestId, labTests.id))
    .innerJoin(patients, eq(labOrders.patientId, patients.id))
    .innerJoin(providers, eq(labOrders.orderedByProviderId, providers.id))
    .orderBy(desc(labOrders.orderedAt))

  return rows.map(mapWorklistRow)
}

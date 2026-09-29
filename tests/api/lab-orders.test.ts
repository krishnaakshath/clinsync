import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { patients, providers, labTests, labOrders, labResults, documents } from '@/db/schema'
import { createLabOrder, markCollected, enterResult, cancelOrder, listWorklist, listOrdersForPatient } from '@/lib/queries/lab-orders'

const createdOrderIds: number[] = []
const createdDocumentIds: number[] = []
afterEach(async () => {
  while (createdDocumentIds.length > 0) {
    await getDb().delete(documents).where(eq(documents.id, createdDocumentIds.pop()!))
  }
  while (createdOrderIds.length > 0) {
    const id = createdOrderIds.pop()!
    await getDb().delete(labResults).where(eq(labResults.labOrderId, id))
    await getDb().delete(labOrders).where(eq(labOrders.id, id))
  }
})

async function makeOrder() {
  const db = getDb()
  const [test] = await db.select({ id: labTests.id }).from(labTests).limit(1)
  const [providerRow] = await db.select({ id: providers.id }).from(providers).limit(1)
  const [patientRow] = await db.select({ id: patients.id }).from(patients).limit(1)
  const order = await createLabOrder({ patientId: patientRow.id, labTestId: test.id, orderedByProviderId: providerRow.id })
  createdOrderIds.push(order.id)
  return order
}

async function attachDocument(orderId: number, patientId: string, name: string) {
  const [doc] = await getDb().insert(documents).values({
    name,
    documentDate: '2026-09-29',
    receivedFrom: 'Test Imaging Center',
    documentType: 'imaging_result',
    patientId,
    admissionId: null,
    labOrderId: orderId,
    fileUrl: `https://blob.test/${name}`,
    fileType: 'JPG',
    filedByName: 'Tester',
    filedAt: new Date(),
  }).returning()
  createdDocumentIds.push(doc.id)
  return doc
}

describe('lab order lifecycle — query layer', () => {
  it('createLabOrder sets initial status ordered', async () => {
    const order = await makeOrder()
    expect(order.status).toBe('ordered')
  })

  it('markCollected transitions ordered -> collected and sets collectedAt; a second call does not double-apply (Review Focus #2)', async () => {
    const order = await makeOrder()

    const first = await markCollected(order.id)
    expect(first.ok).toBe(true)

    const [afterFirst] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(afterFirst.status).toBe('collected')
    expect(afterFirst.collectedAt).not.toBeNull()
    const collectedAtAfterFirst = afterFirst.collectedAt

    const second = await markCollected(order.id)
    expect(second.ok).toBe(false)

    const [afterSecond] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(afterSecond.status).toBe('collected')
    expect(afterSecond.collectedAt?.getTime()).toBe(collectedAtAfterFirst?.getTime())
  })

  it('enterResult rejects an order that has never been collected (Review Focus #1)', async () => {
    const order = await makeOrder()

    const result = await enterResult(order.id, { value: '5', flag: 'normal', resultedByName: 'Tester' })
    expect(result.ok).toBe(false)

    const [row] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(row.status).toBe('ordered')
    const resultRows = await getDb().select().from(labResults).where(eq(labResults.labOrderId, order.id))
    expect(resultRows.length).toBe(0)
  })

  it('enterResult transitions collected -> resulted and inserts the result row', async () => {
    const order = await makeOrder()
    const collect = await markCollected(order.id)
    expect(collect.ok).toBe(true)

    const result = await enterResult(order.id, { value: '5.2', unit: 'mg/dL', flag: 'normal', resultedByName: 'Tester' })
    expect(result.ok).toBe(true)

    const [row] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(row.status).toBe('resulted')
    const [resultRow] = await getDb().select().from(labResults).where(eq(labResults.labOrderId, order.id))
    expect(resultRow.value).toBe('5.2')
    expect(resultRow.unit).toBe('mg/dL')
  })

  it('cancelOrder transitions an ordered order to cancelled', async () => {
    const order = await makeOrder()
    const result = await cancelOrder(order.id, 'Patient declined the draw')
    expect(result.ok).toBe(true)

    const [row] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(row.status).toBe('cancelled')
  })

  it('cancelOrder transitions a collected order to cancelled', async () => {
    const order = await makeOrder()
    await markCollected(order.id)
    const result = await cancelOrder(order.id, 'Sample lost in transit')
    expect(result.ok).toBe(true)

    const [row] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(row.status).toBe('cancelled')
  })

  it('cancelOrder rejects a resulted order (Review Focus #3 — terminal state)', async () => {
    const order = await makeOrder()
    await markCollected(order.id)
    await enterResult(order.id, { value: '1', flag: 'normal', resultedByName: 'Tester' })

    const result = await cancelOrder(order.id, 'too late now')
    expect(result.ok).toBe(false)

    const [row] = await getDb().select().from(labOrders).where(eq(labOrders.id, order.id))
    expect(row.status).toBe('resulted')
  })

  it('cancelOrder rejects an already-cancelled order (Review Focus #3 — terminal state)', async () => {
    const order = await makeOrder()
    const firstCancel = await cancelOrder(order.id, 'first cancellation')
    expect(firstCancel.ok).toBe(true)

    const secondCancel = await cancelOrder(order.id, 'second cancellation')
    expect(secondCancel.ok).toBe(false)
  })

  it('exposes the test category on every worklist row', async () => {
    const order = await makeOrder()
    const rows = await listWorklist()
    const row = rows.find((r) => r.id === order.id)!
    expect(['lab', 'imaging']).toContain(row.category)
  })

  it('returns attachments as an empty array, never null, for an order with no images', async () => {
    const order = await makeOrder()
    expect((await listWorklist()).find((r) => r.id === order.id)!.attachments).toEqual([])
    expect((await listOrdersForPatient(order.patientId)).find((r) => r.id === order.id)!.attachments).toEqual([])
  })

  it('returns an imaging order\'s own attachments on both surfaces, and no other order\'s', async () => {
    const orderA = await makeOrder()
    const orderB = await makeOrder()
    const docA1 = await attachDocument(orderA.id, orderA.patientId, 'chest-ap.jpg')
    const docA2 = await attachDocument(orderA.id, orderA.patientId, 'chest-lateral.jpg')
    const docB = await attachDocument(orderB.id, orderB.patientId, 'knee-ap.jpg')

    const worklistRows = await listWorklist()
    const worklistRowA = worklistRows.find((r) => r.id === orderA.id)!
    const worklistRowB = worklistRows.find((r) => r.id === orderB.id)!
    expect(worklistRowA.attachments.map((a) => a.id).sort()).toEqual([docA1.id, docA2.id].sort())
    expect(worklistRowB.attachments.map((a) => a.id)).toEqual([docB.id])

    const patientRowA = (await listOrdersForPatient(orderA.patientId)).find((r) => r.id === orderA.id)!
    expect(patientRowA.attachments).toHaveLength(2)
  })

  it('resolves the patient name on the worklist without selecting retired patient columns', async () => {
    const order = await makeOrder()
    const row = (await listWorklist()).find((r) => r.id === order.id)!
    expect(typeof row.patientName).toBe('string')
    expect(row.patientName.length).toBeGreaterThan(0)
  })
})

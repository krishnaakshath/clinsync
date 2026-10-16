import { describe, it, expect, afterEach } from 'vitest'
import { upsertProcedureCodeFromTebra } from '@/lib/queries/procedure-codes'
import { getDb } from '@/db/client'
import { procedureCodes } from '@/db/schema'
import { eq } from 'drizzle-orm'

describe('upsertProcedureCodeFromTebra', () => {
  // Unique per test-run tebraId so repeated runs against the shared dev DB
  // never collide with a row a previous run left behind.
  const testTebraId = `tebra-test-procedure-code-${Date.now()}`

  afterEach(async () => {
    await getDb().delete(procedureCodes).where(eq(procedureCodes.tebraId, testTebraId))
  })

  it('inserts on first call and updates the same row (not a duplicate) on a second call with changed fields', async () => {
    await upsertProcedureCodeFromTebra({ tebraId: testTebraId, code: '90837', description: 'Psychotherapy, 60 minutes' })

    const rowsAfterFirst = await getDb().select().from(procedureCodes).where(eq(procedureCodes.tebraId, testTebraId))
    expect(rowsAfterFirst.length).toBe(1)
    expect(rowsAfterFirst[0].code).toBe('90837')
    expect(rowsAfterFirst[0].description).toBe('Psychotherapy, 60 minutes')

    await upsertProcedureCodeFromTebra({ tebraId: testTebraId, code: '90834', description: 'Psychotherapy, 45 minutes' })

    const rowsAfterSecond = await getDb().select().from(procedureCodes).where(eq(procedureCodes.tebraId, testTebraId))
    expect(rowsAfterSecond.length).toBe(1)
    expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id)
    expect(rowsAfterSecond[0].code).toBe('90834')
    expect(rowsAfterSecond[0].description).toBe('Psychotherapy, 45 minutes')
  })
})

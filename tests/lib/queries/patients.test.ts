// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { findLikelyDuplicatePatients } from '@/lib/queries/patients'

// findLikelyDuplicatePatients used to check both the Tebra- and
// IntakeQ-sourced name/dob column pairs (pre-unified-patient-record). These
// fixtures confirm it now reads the single `name`/`dob` columns correctly.
const TEST_ID_A = 'RD-DUP-TEST-A'
const TEST_ID_B = 'RD-DUP-TEST-B'

beforeAll(async () => {
  await getDb().insert(patients).values([
    { id: TEST_ID_A, name: 'Jordan Rivera', dob: '1988-04-12' },
    { id: TEST_ID_B, name: 'Jordan Rivera-Smith', dob: '1988-04-12' },
  ])
})

afterAll(async () => {
  await getDb().delete(patients).where(eq(patients.id, TEST_ID_A))
  await getDb().delete(patients).where(eq(patients.id, TEST_ID_B))
})

describe('findLikelyDuplicatePatients', () => {
  it('matches rows sharing the same dob and an overlapping (substring) name', async () => {
    const matches = await findLikelyDuplicatePatients('Jordan Rivera', '1988-04-12')
    const ids = matches.map((m) => m.id)
    expect(ids).toContain(TEST_ID_A)
    expect(ids).toContain(TEST_ID_B)

    const a = matches.find((m) => m.id === TEST_ID_A)
    expect(a?.name).toBe('Jordan Rivera')
    expect(a?.dob).toBe('1988-04-12')
  })

  it('excludes rows with a matching dob but no name overlap', async () => {
    const matches = await findLikelyDuplicatePatients('Completely Different Name', '1988-04-12')
    const ids = matches.map((m) => m.id)
    expect(ids).not.toContain(TEST_ID_A)
    expect(ids).not.toContain(TEST_ID_B)
  })

  it('excludes rows with a matching name but a different dob', async () => {
    const matches = await findLikelyDuplicatePatients('Jordan Rivera', '1975-01-01')
    const ids = matches.map((m) => m.id)
    expect(ids).not.toContain(TEST_ID_A)
    expect(ids).not.toContain(TEST_ID_B)
  })
})

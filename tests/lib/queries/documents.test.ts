import { describe, it, expect } from 'vitest'
import { listDocuments, getDocument } from '@/lib/queries/documents'

describe('listDocuments', () => {
  it('returns the seeded documents joined with patient info', async () => {
    const rows = await listDocuments()
    expect(rows.length).toBeGreaterThanOrEqual(10)
    const linked = rows.find((d) => d.patientId === 'RD-0001')
    expect(linked?.patientName).toBeTruthy()
  })
})

describe('getDocument', () => {
  it('returns null for a non-existent id', async () => {
    const result = await getDocument(999999)
    expect(result).toBeNull()
  })
})

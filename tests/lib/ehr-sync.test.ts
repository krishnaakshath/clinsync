import { describe, it, expect, vi } from 'vitest'

const insertValues = vi.fn(async (_values: Record<string, unknown>) => undefined)
const insertMock = vi.fn(() => ({ values: insertValues }))
const selectFromMock = vi.fn()

vi.mock('@/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: selectFromMock }),
    insert: insertMock,
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  }),
}))

vi.mock('@/connectors/intakeq.mock', () => ({
  listClients: vi.fn(async () => [
    { clientId: 'iq-test', firstName: 'Jordan', lastName: 'Reyes', dateOfBirth: '1990-01-01', city: null, zip: null, phone: null, email: null },
  ]),
  getIntakeByClientId: vi.fn(async () => null),
}))

vi.mock('@/connectors/tebra.mock', () => ({
  searchPatient: vi.fn(async () => [
    { tebraPatientId: 'tebra-test', firstName: 'Jordan', lastName: 'Reyas', birthDate: '1990-01-01', city: null, zip: null, email: null, generalPractitioner: null },
  ]),
  getPatientById: vi.fn(async () => null),
}))

vi.mock('@/lib/cache', () => ({
  invalidateCache: vi.fn(async () => undefined),
  patientDetailCacheKey: vi.fn(),
  patientListCacheKey: vi.fn(),
}))

import { syncFromEhrs } from '@/lib/ehr-sync'

describe('syncFromEhrs identity-match confidence', () => {
  it('computes a real name-similarity confidence instead of hardcoding 95', async () => {
    selectFromMock
      .mockResolvedValueOnce([]) // existing patients (none known yet)
      .mockResolvedValueOnce([]) // pending identity matches (none queued yet)

    await syncFromEhrs()

    expect(insertValues).toHaveBeenCalledTimes(1)
    const inserted = insertValues.mock.calls[0][0] as { confidence: number }
    // "Jordan Reyes" vs "Jordan Reyas" is a one-character Levenshtein
    // distance out of 12, which matchConfidence()'s real algorithm scores
    // at exactly 92 (round((1 - 1/12) * 100)) -- distinct from the old
    // hardcoded 95, which a >0/<100 range check alone cannot distinguish
    // from a real computed value that also happens to land under 100.
    expect(inserted.confidence).toBe(92)
  })
})

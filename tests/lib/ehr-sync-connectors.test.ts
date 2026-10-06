import { describe, it, expect, vi, beforeEach } from 'vitest'
import { patients, identityMatches, diagnoses, medicationEpisodes } from '@/db/schema'
import type { IntakeQConnector, TebraConnector, FHIRPatient, IntakeQClient } from '@/connectors/types'
import { EhrNotConfiguredError } from '@/connectors/errors'

// Pure unit test of syncFromEhrs()'s use of the connector factory -- the DB
// is a recording fake (no Neon/Redis needed). The DB-backed behaviour of the
// reconciliation itself is covered by the existing integration tests.
const calls: { op: string; table: unknown; value?: unknown }[] = []
let tableRows = new Map<unknown, unknown[]>()

const fakeDb = {
  select: () => ({ from: (table: unknown) => Promise.resolve(tableRows.get(table) ?? []) }),
  insert: (table: unknown) => ({ values: (value: unknown) => { calls.push({ op: 'insert', table, value }); return Promise.resolve() } }),
  update: (table: unknown) => ({ set: (value: unknown) => ({ where: () => { calls.push({ op: 'update', table, value }); return Promise.resolve() } }) }),
  delete: (table: unknown) => ({ where: () => { calls.push({ op: 'delete', table }); return Promise.resolve() } }),
}
const getDb = vi.fn(() => fakeDb)
vi.mock('@/db/client', () => ({ getDb: () => getDb() }))
vi.mock('@/lib/cache', () => ({
  invalidateCache: vi.fn(async () => {}),
  patientDetailCacheKey: (id: string) => `d:${id}`,
  patientListCacheKey: (t: string | null) => `l:${t}`,
}))

const requireEhrConnectors = vi.fn()
vi.mock('@/connectors', () => ({ requireEhrConnectors: () => requireEhrConnectors() }))

const { syncFromEhrs } = await import('@/lib/ehr-sync')

function tebraStub(list: FHIRPatient[], supportsClinicalData: boolean): TebraConnector {
  return {
    supportsClinicalData,
    listPatients: vi.fn(async () => list),
    searchPatient: vi.fn(async () => { throw new Error('sync must not call searchPatient per client') }),
    getPatientById: vi.fn(async () => { throw new Error('sync must not call getPatientById per patient') }),
    createPatient: vi.fn(),
    getActiveMedications: vi.fn(async () => []),
    getInactiveMedications: vi.fn(async () => []),
    getConditions: vi.fn(async () => []),
    testConnection: vi.fn(async () => {}),
  }
}
function intakeqStub(clients: IntakeQClient[]): IntakeQConnector {
  return {
    listClients: vi.fn(async () => clients),
    getClient: vi.fn(async () => null),
    getIntakeByClientId: vi.fn(async () => null),
    getFullIntake: vi.fn(async () => null),
    testConnection: vi.fn(async () => {}),
  }
}

const MARIA_TEBRA: FHIRPatient = { tebraPatientId: '5001', firstName: 'Maria', lastName: 'Alvarez', birthDate: '1985-03-12', city: 'Redlands', zip: '92373', email: 'm@example.com', generalPractitioner: 'Dr. Demo' }
const MARIA_IQ: IntakeQClient = { clientId: '77', firstName: ' maria ', lastName: 'ALVAREZ', dateOfBirth: '1985-03-12', city: 'Redlands', zip: '92373', phone: '', email: '' }

beforeEach(() => {
  calls.length = 0
  tableRows = new Map()
  getDb.mockClear()
  requireEhrConnectors.mockReset()
})

describe('syncFromEhrs + connector factory', () => {
  it('fails with "EHR connections are not configured" before touching the DB', async () => {
    requireEhrConnectors.mockRejectedValue(new EhrNotConfiguredError())
    await expect(syncFromEhrs()).rejects.toThrow(/EHR connections are not configured/)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('matches new IntakeQ clients against one Tebra listing (normalised name + DOB) and queues a match', async () => {
    const tebra = tebraStub([MARIA_TEBRA], false)
    requireEhrConnectors.mockResolvedValue({ intakeq: intakeqStub([MARIA_IQ]), tebra })
    const result = await syncFromEhrs()
    expect(result).toEqual({ newPatients: 0, newMatches: 1, refreshedPatients: 0 })
    expect(tebra.listPatients).toHaveBeenCalledTimes(1)
    const match = calls.find((c) => c.op === 'insert' && c.table === identityMatches)
    expect(match?.value).toMatchObject({ intakeqClientIdRef: 'ENC[77]', candidateTebraPatientIdRef: 'ENC[5001]' })
  })

  it('refreshes linked patients from the listing, and leaves diagnoses/medications alone when the source cannot provide them', async () => {
    tableRows.set(patients, [{ id: 'RD-0001', intakeqClientIdRef: 'ENC[77]', tebraPatientIdRef: 'ENC[5001]' }])
    requireEhrConnectors.mockResolvedValue({ intakeq: intakeqStub([]), tebra: tebraStub([MARIA_TEBRA], false) })
    const result = await syncFromEhrs()
    expect(result.refreshedPatients).toBe(1)
    expect(calls.find((c) => c.op === 'update' && c.table === patients)?.value).toMatchObject({ nameTebra: 'Maria Alvarez', currentProvider: 'Dr. Demo' })
    expect(calls.some((c) => c.table === diagnoses || c.table === medicationEpisodes)).toBe(false)
  })

  it('replaces diagnoses/medications when the source does provide them', async () => {
    tableRows.set(patients, [{ id: 'RD-0001', intakeqClientIdRef: 'ENC[77]', tebraPatientIdRef: 'ENC[5001]' }])
    requireEhrConnectors.mockResolvedValue({ intakeq: intakeqStub([]), tebra: tebraStub([MARIA_TEBRA], true) })
    await syncFromEhrs()
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.table)).toEqual([diagnoses, medicationEpisodes])
  })

  it('never touches staff-owned fields when refreshing', async () => {
    tableRows.set(patients, [{ id: 'RD-0001', intakeqClientIdRef: 'ENC[77]', tebraPatientIdRef: 'ENC[5001]' }])
    requireEhrConnectors.mockResolvedValue({ intakeq: intakeqStub([]), tebra: tebraStub([MARIA_TEBRA], false) })
    await syncFromEhrs()
    const update = calls.find((c) => c.op === 'update' && c.table === patients)!.value as Record<string, unknown>
    expect(Object.keys(update).sort()).toEqual(['chartDataAsOf', 'cityTebra', 'currentProvider', 'dobTebra', 'emailTebra', 'nameTebra', 'zipTebra'])
  })
})

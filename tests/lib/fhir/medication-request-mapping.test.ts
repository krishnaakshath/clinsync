import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { patients, medicationEpisodes } from '@/db/schema'
import { medicationEpisodeToFhir, medicationEpisodesToFhir } from '@/lib/fhir/medication-request'

const createdPatientIds: string[] = []
const createdEpisodeIds: number[] = []
afterEach(async () => {
  while (createdEpisodeIds.length > 0) await getDb().delete(medicationEpisodes).where(eq(medicationEpisodes.id, createdEpisodeIds.pop()!))
  while (createdPatientIds.length > 0) await getDb().delete(patients).where(eq(patients.id, createdPatientIds.pop()!))
})

describe('medicationEpisodeToFhir', () => {
  it('maps an active episode to a MedicationRequest', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-M1', intakeqClientIdRef: 'test-ref-m1', nameIntakeq: 'Med Patient', dobIntakeq: '1980-01-01',
    }).returning()
    createdPatientIds.push(patient.id)

    const [activeRow] = await getDb().insert(medicationEpisodes).values({
      patientId: patient.id, name: 'Sertraline', medicationClass: 'SSRI', dose: '100mg daily', startDate: '2026-01-01', status: 'active',
    }).returning()
    createdEpisodeIds.push(activeRow.id)

    const fhir = medicationEpisodeToFhir(activeRow)
    expect(fhir).not.toBeNull()
    expect(fhir!.resourceType).toBe('MedicationRequest')
    expect(fhir!.status).toBe('active')
    expect(fhir!.subject).toEqual({ reference: `Patient/${patient.id}` })
    expect(fhir!.medicationCodeableConcept).toEqual({ text: 'Sertraline (SSRI)' })
    expect(fhir!.dosageInstruction).toEqual([{ text: '100mg daily' }])
    expect(fhir!.authoredOn).toBe('2026-01-01')
  })

  it('returns null for an inactive episode', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-M2', intakeqClientIdRef: 'test-ref-m2', nameIntakeq: 'Med Patient 2', dobIntakeq: '1980-01-01',
    }).returning()
    createdPatientIds.push(patient.id)

    const [inactiveRow] = await getDb().insert(medicationEpisodes).values({
      patientId: patient.id, name: 'Fluoxetine', medicationClass: 'SSRI', dose: '20mg daily',
      startDate: '2025-06-01', stopDate: '2025-12-01', status: 'inactive',
    }).returning()
    createdEpisodeIds.push(inactiveRow.id)

    expect(medicationEpisodeToFhir(inactiveRow)).toBeNull()
  })

  it('omits dosageInstruction entirely when dose is null', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-M3', intakeqClientIdRef: 'test-ref-m3', nameIntakeq: 'Med Patient 3', dobIntakeq: '1980-01-01',
    }).returning()
    createdPatientIds.push(patient.id)

    const [row] = await getDb().insert(medicationEpisodes).values({
      patientId: patient.id, name: 'Bupropion', medicationClass: 'NDRI', startDate: '2026-01-01', status: 'active',
    }).returning()
    createdEpisodeIds.push(row.id)

    const fhir = medicationEpisodeToFhir(row)
    expect(fhir!.dosageInstruction).toBeUndefined()
  })

  it('medicationEpisodesToFhir filters out inactive episodes', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-M4', intakeqClientIdRef: 'test-ref-m4', nameIntakeq: 'Med Patient 4', dobIntakeq: '1980-01-01',
    }).returning()
    createdPatientIds.push(patient.id)

    const [activeRow] = await getDb().insert(medicationEpisodes).values({
      patientId: patient.id, name: 'Sertraline', medicationClass: 'SSRI', dose: '100mg daily', startDate: '2026-01-01', status: 'active',
    }).returning()
    createdEpisodeIds.push(activeRow.id)
    const [inactiveRow] = await getDb().insert(medicationEpisodes).values({
      patientId: patient.id, name: 'Fluoxetine', medicationClass: 'SSRI', dose: '20mg daily',
      startDate: '2025-06-01', stopDate: '2025-12-01', status: 'inactive',
    }).returning()
    createdEpisodeIds.push(inactiveRow.id)

    const fhirList = medicationEpisodesToFhir([activeRow, inactiveRow])
    expect(fhirList).toHaveLength(1)
    expect(fhirList[0].medicationCodeableConcept).toEqual({ text: 'Sertraline (SSRI)' })
  })
})

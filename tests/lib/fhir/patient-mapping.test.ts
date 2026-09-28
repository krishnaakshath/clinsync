import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { patientToFhir } from '@/lib/fhir/patient'

const createdIds: string[] = []
afterEach(async () => {
  while (createdIds.length > 0) await getDb().delete(patients).where(eq(patients.id, createdIds.pop()!))
})

describe('patientToFhir', () => {
  it('maps identifier, name, and Tebra-preferred DOB', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-P1', intakeqClientIdRef: 'test-ref', nameIntakeq: 'Intake Name', nameTebra: 'Tebra Name',
      dobIntakeq: '1985-03-01', dobTebra: '1985-03-02',
    }).returning()
    createdIds.push(patient.id)

    const fhir = patientToFhir(patient)
    expect(fhir.resourceType).toBe('Patient')
    expect(fhir.id).toBe('RD-FHIR-P1')
    expect(fhir.identifier).toEqual([{ value: 'RD-FHIR-P1' }])
    expect(fhir.name).toEqual([{ text: 'Tebra Name' }])
    expect(fhir.birthDate).toBe('1985-03-02') // dobTebra wins over dobIntakeq — Dual-Sourced Fields precedence
  })

  it('falls back to IntakeQ name and DOB when Tebra fields are null', async () => {
    const [patient] = await getDb().insert(patients).values({
      id: 'RD-FHIR-P2', intakeqClientIdRef: 'test-ref-2', nameIntakeq: 'Only Intake Name', dobIntakeq: '1990-06-15',
    }).returning()
    createdIds.push(patient.id)

    const fhir = patientToFhir(patient)
    expect(fhir.name).toEqual([{ text: 'Only Intake Name' }])
    expect(fhir.birthDate).toBe('1990-06-15')
    expect(fhir).not.toHaveProperty('gender') // this app tracks no gender/sex field on `patients` — never fabricate one
  })
})

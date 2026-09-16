import { describe, it, expect } from 'vitest'
import { getClient, getFullIntake } from '@/connectors/intakeq.mock'
import { searchPatient, getActiveMedications, getConditions } from '@/connectors/tebra.mock'

describe('mock connectors', () => {
  it('IntakeQ getClient returns a client by id', async () => {
    const client = await getClient('iq-001')
    expect(client?.clientId).toBe('iq-001')
  })

  it('IntakeQ getFullIntake returns rating scales', async () => {
    const intake = await getFullIntake('intake-001')
    expect(intake?.ratingScales.length).toBeGreaterThan(0)
  })

  it('Tebra searchPatient matches by name and DOB', async () => {
    const results = await searchPatient('Maria Alvarez', '1985-03-12')
    expect(results.length).toBeGreaterThan(0)
  })

  it('Tebra getActiveMedications returns medication class', async () => {
    const meds = await getActiveMedications('tebra-001')
    expect(meds[0].medicationClass).toBeDefined()
  })

  it('Tebra getConditions returns ICD-10 codes', async () => {
    const conditions = await getConditions('tebra-001')
    expect(conditions[0].code).toMatch(/^[A-Z]\d/)
  })
})

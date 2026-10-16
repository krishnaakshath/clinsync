import { describe, it, expect } from 'vitest'
import { tebraMock } from '@/connectors/tebra.mock'

describe('Tebra mock connector new methods', () => {
  it('getAppointments returns non-empty array with expected shape', async () => {
    const appointments = await tebraMock.getAppointments({})
    expect(appointments.length).toBeGreaterThan(0)
    expect(appointments[0]).toHaveProperty('tebraId')
    expect(appointments[0]).toHaveProperty('patientId')
    expect(appointments[0]).toHaveProperty('providerId')
    expect(appointments[0]).toHaveProperty('startsAt')
    expect(appointments[0]).toHaveProperty('endsAt')
    expect(appointments[0]).toHaveProperty('visitReason')
    expect(appointments[0]).toHaveProperty('status')
  })

  it('getCharges returns non-empty array with expected shape', async () => {
    const charges = await tebraMock.getCharges({})
    expect(charges.length).toBeGreaterThan(0)
    expect(charges[0]).toHaveProperty('tebraId')
    expect(charges[0]).toHaveProperty('patientId')
    expect(charges[0]).toHaveProperty('encounterId')
    expect(charges[0]).toHaveProperty('dateOfService')
    expect(charges[0]).toHaveProperty('diagnosisCodes')
    expect(charges[0]).toHaveProperty('procedureCodes')
    expect(charges[0]).toHaveProperty('amountCents')
    expect(charges[0]).toHaveProperty('status')
    expect(charges[0]).toHaveProperty('primaryInsurance')
    expect(charges[0]).toHaveProperty('secondaryInsurance')
    expect(charges[0]).toHaveProperty('tertiaryInsurance')
  })

  it('getPayments returns non-empty array with expected shape', async () => {
    const payments = await tebraMock.getPayments({})
    expect(payments.length).toBeGreaterThan(0)
    expect(payments[0]).toHaveProperty('tebraId')
    expect(payments[0]).toHaveProperty('patientId')
    expect(payments[0]).toHaveProperty('payerName')
    expect(payments[0]).toHaveProperty('payerType')
    expect(payments[0]).toHaveProperty('amountCents')
    expect(payments[0]).toHaveProperty('method')
    expect(payments[0]).toHaveProperty('postedDate')
  })

  it('getProviders returns non-empty array with expected shape', async () => {
    const providers = await tebraMock.getProviders()
    expect(providers.length).toBeGreaterThan(0)
    expect(providers[0]).toHaveProperty('tebraId')
    expect(providers[0]).toHaveProperty('name')
    expect(providers[0]).toHaveProperty('specialty')
  })

  it('getServiceLocations returns non-empty array with expected shape', async () => {
    const locations = await tebraMock.getServiceLocations()
    expect(locations.length).toBeGreaterThan(0)
    expect(locations[0]).toHaveProperty('tebraId')
    expect(locations[0]).toHaveProperty('name')
  })

  it('getProcedureCodes returns non-empty array with expected shape', async () => {
    const codes = await tebraMock.getProcedureCodes()
    expect(codes.length).toBeGreaterThan(0)
    expect(codes[0]).toHaveProperty('tebraId')
    expect(codes[0]).toHaveProperty('code')
    expect(codes[0]).toHaveProperty('description')
  })

  it('getEncounterDetails returns non-null object with expected shape', async () => {
    const encounter = await tebraMock.getEncounterDetails('tebra-enc-001')
    expect(encounter).not.toBeNull()
    expect(encounter).toHaveProperty('tebraId')
    expect(encounter).toHaveProperty('patientId')
    expect(encounter).toHaveProperty('providerId')
    expect(encounter).toHaveProperty('serviceLocationId')
    expect(encounter).toHaveProperty('serviceStartDate')
    expect(encounter).toHaveProperty('serviceEndDate')
    expect(encounter).toHaveProperty('status')
  })
})

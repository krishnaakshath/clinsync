import { IntakeQClient, IntakeQIntake } from './types'

const CLIENTS: Record<string, IntakeQClient> = {
  'iq-001': { clientId: 'iq-001', firstName: 'Maria', lastName: 'Alvarez', dateOfBirth: '1985-03-12', city: 'Redlands', zip: '92373', phone: '909-555-0142', email: 'malvarez.demo@example.com' },
}

const INTAKES: Record<string, IntakeQIntake> = {
  'intake-001': { intakeId: 'intake-001', clientId: 'iq-001', referralType: 'Provider referral', availability: 'Weekday mornings', consentSigned: true, consentPreference: 'Phone', ratingScales: [{ name: 'PHQ-9', score: 18, date: '2026-09-01' }] },
}

export async function getClient(clientId: string): Promise<IntakeQClient | null> {
  return CLIENTS[clientId] ?? null
}

export async function getFullIntake(intakeId: string): Promise<IntakeQIntake | null> {
  return INTAKES[intakeId] ?? null
}

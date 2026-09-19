import { IntakeQClient, IntakeQIntake } from './types'

const CLIENTS: Record<string, IntakeQClient> = {
  // Has a matching Tebra chart (see tebra.mock.ts) -- an existing patient
  // returning through a new intake, not a brand-new one. syncFromEhrs()
  // routes this into the Identity Matching queue instead of auto-creating
  // a second chart for the same person.
  'iq-001': { clientId: 'iq-001', firstName: 'Maria', lastName: 'Alvarez', dateOfBirth: '1985-03-12', city: 'Redlands', zip: '92373', phone: '909-555-0142', email: 'malvarez.demo@example.com' },
  // No Tebra chart anywhere -- a genuinely new patient. syncFromEhrs()
  // creates the patient record directly from IntakeQ data alone.
  'iq-002': { clientId: 'iq-002', firstName: 'Jordan', lastName: 'Reyes', dateOfBirth: '1990-07-22', city: 'Redlands', zip: '92374', phone: '909-555-0198', email: 'jreyes.demo@example.com' },
}

const INTAKES: Record<string, IntakeQIntake> = {
  'intake-001': { intakeId: 'intake-001', clientId: 'iq-001', referralType: 'Provider referral', availability: 'Weekday mornings', consentSigned: true, consentPreference: 'Phone', ratingScales: [{ name: 'PHQ-9', score: 18, date: '2026-09-01' }] },
  'intake-002': { intakeId: 'intake-002', clientId: 'iq-002', referralType: 'Self-referral', availability: 'Weekday afternoons', consentSigned: true, consentPreference: 'Email', ratingScales: [{ name: 'GAD-7', score: 12, date: '2026-09-10' }] },
}

export async function getClient(clientId: string): Promise<IntakeQClient | null> {
  return CLIENTS[clientId] ?? null
}

export async function getFullIntake(intakeId: string): Promise<IntakeQIntake | null> {
  return INTAKES[intakeId] ?? null
}

/** Every client IntakeQ has on file -- the "pull all patients" side of a sync. */
export async function listClients(): Promise<IntakeQClient[]> {
  return Object.values(CLIENTS)
}

/** Every intake IntakeQ has on file, keyed for lookup by clientId. */
export async function listIntakes(): Promise<IntakeQIntake[]> {
  return Object.values(INTAKES)
}

export async function getIntakeByClientId(clientId: string): Promise<IntakeQIntake | null> {
  return Object.values(INTAKES).find((i) => i.clientId === clientId) ?? null
}

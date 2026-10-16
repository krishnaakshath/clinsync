import type {
  FHIRPatient,
  MedicationRequestResult,
  ConditionResult,
  TebraConnector,
  TebraAppointment,
  TebraCharge,
  TebraPayment,
  TebraProvider,
  TebraServiceLocation,
  TebraProcedureCode,
  TebraEncounterDetail,
} from './types'

// Demo data for local development and tests ONLY. Selected by
// getEhrConnectors() (src/connectors/index.ts) solely when EHR_USE_MOCKS=1
// outside production -- never as a silent fallback.

const PATIENTS: FHIRPatient[] = [
  { tebraPatientId: 'tebra-001', firstName: 'Maria', lastName: 'Alvarez', birthDate: '1985-03-12', city: 'Redlands', zip: '92373', email: 'maria.alvarez.demo@example.com', generalPractitioner: 'Dr. R. Kunam' },
]

const MEDICATIONS: Record<string, MedicationRequestResult[]> = {
  'tebra-001': [
    { name: 'Sertraline', medicationClass: 'SSRI', dose: '100mg daily', startDate: '2026-06-01', stopDate: null, status: 'active' },
    { name: 'Trazodone', medicationClass: 'Atypical antidepressant', dose: '50mg nightly', startDate: '2025-01-15', stopDate: '2025-11-01', status: 'inactive' },
  ],
}

const CONDITIONS: Record<string, ConditionResult[]> = {
  'tebra-001': [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate', date: '2025-01-15' }],
}

const APPOINTMENTS: TebraAppointment[] = [
  {
    tebraId: 'tebra-apt-001',
    patientId: 'tebra-001',
    providerId: 'tebra-prov-001',
    startsAt: '2026-10-20T10:00:00Z',
    endsAt: '2026-10-20T11:00:00Z',
    visitReason: 'Follow-up visit',
    status: 'scheduled',
  },
  {
    tebraId: 'tebra-apt-002',
    patientId: 'tebra-001',
    providerId: 'tebra-prov-001',
    startsAt: '2026-10-27T14:00:00Z',
    endsAt: '2026-10-27T14:30:00Z',
    visitReason: 'Medication review',
    status: 'completed',
  },
]

const PROVIDERS: TebraProvider[] = [
  { tebraId: 'tebra-prov-001', name: 'Dr. R. Kunam', credentials: 'MD', specialty: 'Psychiatry' },
  { tebraId: 'tebra-prov-002', name: 'Dr. A. Chen', credentials: 'MD', specialty: 'Neurology' },
  { tebraId: 'tebra-prov-003', name: 'Dr. M. Gonzalez', credentials: 'NP', specialty: 'Mental Health' },
]

const SERVICE_LOCATIONS: TebraServiceLocation[] = [
  { tebraId: 'tebra-loc-001', name: 'Main Office' },
  { tebraId: 'tebra-loc-002', name: 'Downtown Clinic' },
  { tebraId: 'tebra-loc-003', name: 'Telehealth' },
]

const PROCEDURE_CODES: TebraProcedureCode[] = [
  { tebraId: 'tebra-proc-001', code: '90837', description: 'Psychotherapy, 60 minutes' },
  { tebraId: 'tebra-proc-002', code: '90834', description: 'Psychotherapy, 45 minutes' },
  { tebraId: 'tebra-proc-003', code: '90791', description: 'Psychiatric diagnostic evaluation' },
]

const CHARGES: TebraCharge[] = [
  {
    tebraId: 'tebra-charge-001',
    patientId: 'tebra-001',
    encounterId: 'tebra-enc-001',
    dateOfService: '2026-10-15',
    diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
    procedureCodes: [{ code: '90837', description: 'Psychotherapy, 60 minutes', units: 1, chargeCents: 15000 }],
    amountCents: 15000,
    status: 'approved',
    primaryInsurance: { payerName: 'Blue Cross Blue Shield', billedAmountCents: 15000, paidAmountCents: 12000, status: 'paid' },
    secondaryInsurance: null,
    tertiaryInsurance: null,
  },
  {
    tebraId: 'tebra-charge-002',
    patientId: 'tebra-001',
    encounterId: 'tebra-enc-002',
    dateOfService: '2026-10-22',
    diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
    procedureCodes: [{ code: '90834', description: 'Psychotherapy, 45 minutes', units: 1, chargeCents: 11250 }],
    amountCents: 11250,
    status: 'pending_approval',
    primaryInsurance: { payerName: 'Aetna', billedAmountCents: 11250, paidAmountCents: null, status: 'waiting_adjudication' },
    secondaryInsurance: { payerName: 'United Healthcare', billedAmountCents: 0, paidAmountCents: 0, status: 'denied' },
    tertiaryInsurance: null,
  },
]

const PAYMENTS: TebraPayment[] = [
  {
    tebraId: 'tebra-payment-001',
    patientId: 'tebra-001',
    chargeId: 'tebra-charge-001',
    payerName: 'Blue Cross Blue Shield',
    payerType: 'insurance',
    amountCents: 12000,
    method: 'electronic',
    postedDate: '2026-10-18',
  },
  {
    tebraId: 'tebra-payment-002',
    patientId: 'tebra-001',
    chargeId: null,
    payerName: 'Patient Payment',
    payerType: 'patient',
    amountCents: 3000,
    method: 'credit_card',
    postedDate: '2026-10-19',
  },
]

const ENCOUNTERS: TebraEncounterDetail[] = [
  {
    tebraId: 'tebra-enc-001',
    patientId: 'tebra-001',
    providerId: 'tebra-prov-001',
    serviceLocationId: 'tebra-loc-001',
    serviceStartDate: '2026-10-15',
    serviceEndDate: '2026-10-15',
    status: 'completed',
  },
  {
    tebraId: 'tebra-enc-002',
    patientId: 'tebra-001',
    providerId: 'tebra-prov-001',
    serviceLocationId: 'tebra-loc-001',
    serviceStartDate: '2026-10-22',
    serviceEndDate: '2026-10-22',
    status: 'completed',
  },
]

export async function searchPatient(name: string, dob: string): Promise<FHIRPatient[]> {
  return PATIENTS.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase() === name.toLowerCase() && p.birthDate === dob)
}

export async function getPatientById(tebraPatientId: string): Promise<FHIRPatient | null> {
  return PATIENTS.find((p) => p.tebraPatientId === tebraPatientId) ?? null
}

/** Every patient Tebra has on file -- the "pull all patients" side of a sync. */
export async function listPatients(): Promise<FHIRPatient[]> {
  return PATIENTS
}

let nextPatientNum = PATIENTS.length + 1

/**
 * Registers a brand-new patient chart in Tebra -- the actual clinical
 * record of a patient always originates here, never as a row typed
 * directly into Clinsync's own database. See the "Add New Patient" flow,
 * which calls this instead of inserting into `patients` itself.
 */
export async function createPatient(data: Omit<FHIRPatient, 'tebraPatientId'>): Promise<FHIRPatient> {
  const patient: FHIRPatient = { tebraPatientId: `tebra-${String(nextPatientNum++).padStart(3, '0')}`, ...data }
  PATIENTS.push(patient)
  return patient
}

export async function getActiveMedications(patientId: string): Promise<MedicationRequestResult[]> {
  return (MEDICATIONS[patientId] ?? []).filter((m) => m.status === 'active')
}

export async function getInactiveMedications(patientId: string): Promise<MedicationRequestResult[]> {
  return (MEDICATIONS[patientId] ?? []).filter((m) => m.status === 'inactive')
}

export async function getConditions(patientId: string): Promise<ConditionResult[]> {
  return CONDITIONS[patientId] ?? []
}

export async function testConnection(): Promise<void> {}

export async function getAppointments(_filter: { fromLastModifiedDate?: string }): Promise<TebraAppointment[]> {
  // In a real implementation, would filter by fromLastModifiedDate
  return APPOINTMENTS
}

export async function getCharges(_filter: { fromLastModifiedDate?: string }): Promise<TebraCharge[]> {
  // In a real implementation, would filter by fromLastModifiedDate
  return CHARGES
}

export async function getPayments(_filter: { fromLastModifiedDate?: string }): Promise<TebraPayment[]> {
  // In a real implementation, would filter by fromLastModifiedDate
  return PAYMENTS
}

export async function getProviders(): Promise<TebraProvider[]> {
  return PROVIDERS
}

export async function getServiceLocations(): Promise<TebraServiceLocation[]> {
  return SERVICE_LOCATIONS
}

export async function getProcedureCodes(): Promise<TebraProcedureCode[]> {
  return PROCEDURE_CODES
}

export async function getEncounterDetails(encounterId: string): Promise<TebraEncounterDetail | null> {
  return ENCOUNTERS.find((e) => e.tebraId === encounterId) ?? null
}

export const tebraMock: TebraConnector = {
  supportsClinicalData: true,
  listPatients, searchPatient, getPatientById, createPatient,
  getActiveMedications, getInactiveMedications, getConditions, testConnection,
  getAppointments, getCharges, getPayments, getProviders, getServiceLocations, getProcedureCodes, getEncounterDetails,
}

import { FHIRPatient, MedicationRequestResult, ConditionResult } from './types'

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

export async function getActiveMedications(patientId: string): Promise<MedicationRequestResult[]> {
  return (MEDICATIONS[patientId] ?? []).filter((m) => m.status === 'active')
}

export async function getInactiveMedications(patientId: string): Promise<MedicationRequestResult[]> {
  return (MEDICATIONS[patientId] ?? []).filter((m) => m.status === 'inactive')
}

export async function getConditions(patientId: string): Promise<ConditionResult[]> {
  return CONDITIONS[patientId] ?? []
}

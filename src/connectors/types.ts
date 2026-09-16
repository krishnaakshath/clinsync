export interface IntakeQClient {
  clientId: string
  firstName: string
  lastName: string
  dateOfBirth: string // ISO date
  city: string
  zip: string
  phone: string
  email: string
}

export interface IntakeQIntake {
  intakeId: string
  clientId: string
  referralType: string
  availability: string
  consentSigned: boolean
  consentPreference: string
  ratingScales: { name: string; score: number; date: string }[]
}

export interface FHIRPatient {
  tebraPatientId: string
  firstName: string
  lastName: string
  birthDate: string
  city: string
  zip: string
  email: string
  generalPractitioner: string
}

export interface MedicationRequestResult {
  name: string
  medicationClass: string
  dose: string
  startDate: string
  stopDate: string | null
  status: 'active' | 'inactive'
}

export interface ConditionResult {
  code: string
  description: string
  date: string
}

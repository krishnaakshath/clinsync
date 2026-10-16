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

/**
 * What the sync engine / routes need from IntakeQ. Implemented by the real
 * REST client (intakeq.client.ts) and the demo mock (intakeq.mock.ts).
 */
export interface IntakeQConnector {
  listClients(): Promise<IntakeQClient[]>
  getClient(clientId: string): Promise<IntakeQClient | null>
  getIntakeByClientId(clientId: string): Promise<IntakeQIntake | null>
  getFullIntake(intakeId: string): Promise<IntakeQIntake | null>
  /** Cheap authenticated call; throws EhrConnectorError on failure. */
  testConnection(): Promise<void>
}

/**
 * Appointment data from Tebra
 */
export interface TebraAppointment {
  tebraId: string
  patientId: string
  providerId: string
  startsAt: string // ISO timestamp
  endsAt: string // ISO timestamp
  visitReason: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
}

/**
 * Insurance claim detail for a charge
 */
export interface InsuranceClaimDetail {
  payerName: string
  billedAmountCents: number
  paidAmountCents: number | null
  status: string
}

/**
 * Charge data from Tebra
 */
export interface TebraCharge {
  tebraId: string
  patientId: string
  encounterId: string | null
  dateOfService: string // ISO date
  diagnosisCodes: { code: string; description: string }[]
  procedureCodes: { code: string; description: string; units: number; chargeCents: number }[]
  amountCents: number
  status: string
  primaryInsurance: InsuranceClaimDetail | null
  secondaryInsurance: InsuranceClaimDetail | null
  tertiaryInsurance: InsuranceClaimDetail | null
}

/**
 * Payment data from Tebra
 */
export interface TebraPayment {
  tebraId: string
  patientId: string
  chargeId: string | null
  payerName: string
  payerType: string
  amountCents: number
  method: string
  postedDate: string // ISO date
}

/**
 * Provider data from Tebra
 */
export interface TebraProvider {
  tebraId: string
  name: string
  credentials: string | null
  specialty: string
}

/**
 * Service location data from Tebra
 */
export interface TebraServiceLocation {
  tebraId: string
  name: string
}

/**
 * Procedure code from Tebra
 */
export interface TebraProcedureCode {
  tebraId: string
  code: string
  description: string
}

/**
 * Encounter detail from Tebra
 */
export interface TebraEncounterDetail {
  tebraId: string
  patientId: string
  providerId: string
  serviceLocationId: string
  serviceStartDate: string // ISO date
  serviceEndDate: string // ISO date
  status: string
}

/**
 * What the sync engine / routes need from Tebra. Implemented by the real
 * SOAP client (tebra.client.ts) and the demo mock (tebra.mock.ts).
 */
export interface TebraConnector {
  /**
   * Whether getActiveMedications/getInactiveMedications/getConditions return
   * real data. The Tebra SOAP 2.1 API has no per-patient medication or
   * diagnosis list, so the real client reports false and the sync engine
   * must leave existing diagnoses/medications untouched rather than
   * "replacing" them with an empty list.
   */
  readonly supportsClinicalData: boolean
  listPatients(): Promise<FHIRPatient[]>
  searchPatient(name: string, dob: string): Promise<FHIRPatient[]>
  getPatientById(tebraPatientId: string): Promise<FHIRPatient | null>
  createPatient(data: Omit<FHIRPatient, 'tebraPatientId'>): Promise<FHIRPatient>
  getActiveMedications(patientId: string): Promise<MedicationRequestResult[]>
  getInactiveMedications(patientId: string): Promise<MedicationRequestResult[]>
  getConditions(patientId: string): Promise<ConditionResult[]>
  getAppointments(filter: { fromLastModifiedDate?: string }): Promise<TebraAppointment[]>
  getCharges(filter: { fromLastModifiedDate?: string }): Promise<TebraCharge[]>
  getPayments(filter: { fromLastModifiedDate?: string }): Promise<TebraPayment[]>
  getProviders(): Promise<TebraProvider[]>
  getServiceLocations(): Promise<TebraServiceLocation[]>
  getProcedureCodes(): Promise<TebraProcedureCode[]>
  getEncounterDetails(encounterId: string): Promise<TebraEncounterDetail | null>
  /** Cheap authenticated call; throws EhrConnectorError on failure. */
  testConnection(): Promise<void>
}

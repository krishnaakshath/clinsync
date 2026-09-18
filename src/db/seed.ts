import { sql } from 'drizzle-orm'
import { getDb } from './client'
import { encryptSensitive } from '../lib/crypto'
import {
  trials,
  patients,
  diagnoses,
  medicationEpisodes,
  patientTrialScreenings,
  screeningCriteriaResults,
  identityMatches,
  users,
  charges,
  insuranceClaims,
  patientStatements,
  mockPayments,
  formTemplates,
  formSubmissions,
  allergies,
  identityVerifications,
  appSettings,
  providers,
  appointments,
  documents,
  faxes,
} from './schema'

const MDD_TRIAL = {
  id: 'nct06911112',
  name: 'Adjunctive Treatment in Major Depressive Disorder',
  nctNumber: 'NCT06911112',
  condition: 'Major Depressive Disorder',
  site: 'Redlands',
  studyDrug: 'NBI-1065845',
  ageMin: 18,
  ageMax: 65,
  diagnosisCodes: [
    { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
    { code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' },
  ],
  ratingScales: [{ name: 'PHQ-9', description: 'Patient Health Questionnaire-9' }],
  medicationClasses: [{ className: 'SSRI/SNRI antidepressant', washoutDays: 56, rule: 'On current antidepressant dose for at least 8 weeks' }],
}

const ADHD_TRIAL = {
  id: 'nct-adhd-demo-01',
  name: 'Extended-Release Stimulant Response Study',
  nctNumber: 'NCT-ADHD-0001',
  condition: 'ADHD',
  site: 'Redlands',
  studyDrug: 'XR-STIM-01',
  ageMin: 18,
  ageMax: 55,
  diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
  ratingScales: [{ name: 'ASRS-v1.1', description: 'Adult ADHD Self-Report Scale' }],
  medicationClasses: [{ className: 'Stimulant', washoutDays: 14, rule: 'No stimulant medication within the last 14 days' }],
}

// Independent provider roster — see the Design Decision section in this
// phase's plan for why this is not backfilled from patients.currentProvider.
// colorTag cycles through the design system's grayscale chart tokens so the
// calendar can color-code providers without ever using a hardcoded color.
const PROVIDER_ROSTER = [
  { name: 'Dr. Rajiv Kunam', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-1' },
  { name: 'Dr. Elena Bosch', credentials: 'MD', specialty: 'Psychiatry', colorTag: 'chart-2' },
  { name: 'Priya Sundaram', credentials: 'PMHNP', specialty: 'Psychiatric Nurse Practitioner', colorTag: 'chart-3' },
  { name: 'Dr. Michael Farr', credentials: 'DO', specialty: 'Psychiatry', colorTag: 'chart-4' },
  { name: 'Dana Whitfield', credentials: 'PMHNP', specialty: 'Psychiatric Nurse Practitioner', colorTag: 'chart-5' },
]

type HeroPatient = {
  id: string; trialId: string; overallStatus: 'green' | 'yellow' | 'red'
  nameIntakeq: string; nameTebra: string | null; dobIntakeq: string; dobTebra: string | null
  city: string; zip: string; phone: string; emailIntakeq: string; emailTebra: string | null
  provider: string; ratingScale: { name: string; score: number; date: string }
  diagnosisCode: { code: string; description: string }
  activeMed: { name: string; medicationClass: string; dose: string; startDate: string }
  criteria: { key: string; text: string; verdict: 'green' | 'yellow' | 'red'; quote: string; sourceDoc: string; sourceDate: string }[]
}

const HERO_PATIENTS: HeroPatient[] = [
  {
    id: 'RD-0001', trialId: 'nct06911112', overallStatus: 'green',
    nameIntakeq: 'Maria Alvarez', nameTebra: 'Maria Alvarez', dobIntakeq: '1985-03-12', dobTebra: '1985-03-12',
    city: 'Redlands', zip: '92373', phone: '909-555-0142', emailIntakeq: 'malvarez.demo@example.com', emailTebra: 'maria.alvarez.demo@example.com',
    provider: 'Dr. R. Kunam', ratingScale: { name: 'PHQ-9', score: 18, date: '2026-09-01' },
    diagnosisCode: { code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' },
    activeMed: { name: 'Sertraline', medicationClass: 'SSRI/SNRI antidepressant', dose: '100mg daily', startDate: '2026-06-01' },
    criteria: [
      { key: 'age-range', text: 'Age 18-65', verdict: 'green', quote: 'DOB 1985-03-12 (age 41)', sourceDoc: 'Tebra Patient record', sourceDate: '2026-09-01' },
      { key: 'diagnosis', text: 'Confirmed MDD diagnosis (F32.x/F33.x)', verdict: 'green', quote: 'Dx: F33.1 Major depressive disorder, recurrent, moderate', sourceDoc: 'Tebra Condition list', sourceDate: '2025-01-15' },
      { key: 'antidepressant-duration', text: 'On current antidepressant dose >= 8 weeks', verdict: 'green', quote: 'Sertraline 100mg daily, start 2026-06-01', sourceDoc: 'Tebra MedicationRequest', sourceDate: '2026-06-01' },
    ],
  },
  {
    id: 'RD-0002', trialId: 'nct06911112', overallStatus: 'red',
    nameIntakeq: 'James Thornton', nameTebra: 'James Thornton', dobIntakeq: '1990-11-02', dobTebra: '1990-11-02',
    city: 'Highland', zip: '92346', phone: '909-555-0198', emailIntakeq: 'jthornton.demo@example.com', emailTebra: 'jthornton.demo@example.com',
    provider: 'Dr. R. Kunam', ratingScale: { name: 'PHQ-9', score: 9, date: '2026-08-20' },
    diagnosisCode: { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
    activeMed: { name: 'Bupropion', medicationClass: 'NDRI (excluded class)', dose: '150mg daily', startDate: '2026-08-01' },
    criteria: [
      { key: 'diagnosis', text: 'Confirmed MDD diagnosis (F32.x/F33.x)', verdict: 'green', quote: 'Dx: F32.1 Major depressive disorder, single episode, moderate', sourceDoc: 'Tebra Condition list', sourceDate: '2026-08-01' },
      { key: 'excluded-medication', text: 'Not currently on an excluded medication class', verdict: 'red', quote: 'Bupropion 150mg daily, start 2026-08-01 — protocol excludes NDRI class', sourceDoc: 'Tebra MedicationRequest', sourceDate: '2026-08-01' },
    ],
  },
  {
    id: 'RD-0003', trialId: 'nct06911112', overallStatus: 'yellow',
    nameIntakeq: 'Linda Cho', nameTebra: null, dobIntakeq: '1978-06-30', dobTebra: null,
    city: 'Yucaipa', zip: '92399', phone: '909-555-0177', emailIntakeq: 'lcho.demo@example.com', emailTebra: null,
    provider: 'Unmatched', ratingScale: { name: 'PHQ-9', score: 15, date: '2026-09-05' },
    diagnosisCode: { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
    activeMed: { name: 'Unknown', medicationClass: 'Unknown', dose: 'Unknown', startDate: '2026-01-01' },
    criteria: [
      { key: 'antidepressant-duration', text: 'On current antidepressant dose >= 8 weeks', verdict: 'yellow', quote: 'No matching Tebra chart yet — identity match pending', sourceDoc: 'N/A', sourceDate: '2026-09-05' },
    ],
  },
  {
    id: 'RD-0004', trialId: 'nct-adhd-demo-01', overallStatus: 'green',
    nameIntakeq: 'Priya Natarajan', nameTebra: 'Priya Natarajan', dobIntakeq: '1994-02-18', dobTebra: '1994-02-18',
    city: 'Redlands', zip: '92374', phone: '909-555-0133', emailIntakeq: 'pnatarajan.demo@example.com', emailTebra: 'pnatarajan.demo@example.com',
    provider: 'Dr. R. Kunam', ratingScale: { name: 'ASRS-v1.1', score: 21, date: '2026-09-02' },
    diagnosisCode: { code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' },
    activeMed: { name: 'None', medicationClass: 'None', dose: 'N/A', startDate: '2026-01-01' },
    criteria: [
      { key: 'diagnosis', text: 'Confirmed ADHD diagnosis (F90.x)', verdict: 'green', quote: 'Dx: F90.2 Attention-deficit hyperactivity disorder, combined type', sourceDoc: 'Tebra Condition list', sourceDate: '2025-11-01' },
      { key: 'stimulant-washout', text: 'No stimulant medication within the last 14 days', verdict: 'green', quote: 'No active or recent stimulant prescriptions on file', sourceDoc: 'Tebra MedicationRequest', sourceDate: '2026-09-02' },
    ],
  },
  {
    id: 'RD-0005', trialId: 'nct-adhd-demo-01', overallStatus: 'red',
    nameIntakeq: 'Marcus Webb', nameTebra: 'Marcus Webb', dobIntakeq: '1988-09-09', dobTebra: '1988-09-09',
    city: 'Loma Linda', zip: '92354', phone: '909-555-0161', emailIntakeq: 'mwebb.demo@example.com', emailTebra: 'mwebb.demo@example.com',
    provider: 'Dr. R. Kunam', ratingScale: { name: 'ASRS-v1.1', score: 19, date: '2026-08-28' },
    diagnosisCode: { code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' },
    activeMed: { name: 'Lisdexamfetamine', medicationClass: 'Stimulant', dose: '30mg daily', startDate: '2026-09-01' },
    criteria: [
      { key: 'stimulant-washout', text: 'No stimulant medication within the last 14 days', verdict: 'red', quote: 'Lisdexamfetamine 30mg daily, active as of 2026-09-01', sourceDoc: 'Tebra MedicationRequest', sourceDate: '2026-09-01' },
    ],
  },
  {
    id: 'RD-0006', trialId: 'nct06911112', overallStatus: 'yellow',
    nameIntakeq: 'Katherine Voss', nameTebra: 'Kathryn Voss', dobIntakeq: '1982-12-05', dobTebra: '1982-12-05',
    city: 'Redlands', zip: '92373', phone: '909-555-0188', emailIntakeq: 'kvoss.demo@example.com', emailTebra: 'kvoss.old@example.com',
    provider: 'Dr. R. Kunam', ratingScale: { name: 'PHQ-9', score: 16, date: '2026-08-15' },
    diagnosisCode: { code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' },
    activeMed: { name: 'Venlafaxine', medicationClass: 'SSRI/SNRI antidepressant', dose: '75mg daily', startDate: '2026-08-10' },
    criteria: [
      { key: 'antidepressant-duration', text: 'On current antidepressant dose >= 8 weeks', verdict: 'yellow', quote: 'Venlafaxine start date 2026-08-10 is only 5 weeks before referral — needs verification against the 8-week rule', sourceDoc: 'Tebra MedicationRequest', sourceDate: '2026-08-10' },
    ],
  },
]

const FILLER_NAMES = [
  'Robert Nguyen', 'Angela Ferraro', 'Devon Okafor', 'Sana Patel', 'Wesley Turner', 'Isabel Marquez',
  'Owen Fitzgerald', 'Grace Kim', 'Tobias Reyes', 'Nadia Suleiman', 'Colin Brantley', 'Fatima Rashid',
]

async function seedFillerPatients() {
  const db = getDb()
  for (let i = 0; i < FILLER_NAMES.length; i++) {
    const id = `RD-${String(7 + i).padStart(4, '0')}`
    const trial = i % 2 === 0 ? MDD_TRIAL : ADHD_TRIAL
    const status: 'green' | 'yellow' | 'red' = ['green', 'green', 'yellow', 'red'][i % 4] as 'green' | 'yellow' | 'red'
    const [first, last] = FILLER_NAMES[i].split(' ')

    await db.insert(patients).values({
      id,
      intakeqClientIdEncrypted: `enc-iq-${id}`,
      tebraPatientIdEncrypted: `enc-tb-${id}`,
      nameIntakeq: FILLER_NAMES[i],
      nameTebra: FILLER_NAMES[i],
      dobIntakeq: `19${80 + i}-0${(i % 9) + 1}-1${i % 9}`,
      dobTebra: `19${80 + i}-0${(i % 9) + 1}-1${i % 9}`,
      cityIntakeq: 'Redlands',
      zipIntakeq: '92373',
      phoneIntakeq: `909-555-0${200 + i}`,
      emailIntakeq: `${first.toLowerCase()}.${last.toLowerCase()}.demo@example.com`,
      currentProvider: 'Dr. R. Kunam',
      ratingScales: [{ name: trial.ratingScales[0].name, score: 12 + i, date: '2026-09-01' }],
      referralType: 'Self-referral',
      availability: 'Flexible',
    })

    const screening = await db.insert(patientTrialScreenings).values({ patientId: id, trialId: trial.id, overallStatus: status }).returning()
    await db.insert(screeningCriteriaResults).values({
      screeningId: screening[0].id,
      criterionKey: 'diagnosis',
      criterionText: `Confirmed ${trial.condition} diagnosis`,
      verdict: status,
      evidenceQuote: `Dx: ${trial.diagnosisCodes[0].code} ${trial.diagnosisCodes[0].description}`,
      evidenceSourceDoc: 'Tebra Condition list',
      evidenceSourceDate: '2026-08-01',
    })
  }
}

async function seedDocumentsAndFaxes() {
  const db = getDb()

  // Documents: metadata-only rows demonstrating the New/Processed status split,
  // a mix of labels, and both patient-linked and unlinked documents.
  await db.insert(documents).values([
    { name: 'Drivers License - Front.jpg', documentDate: '2026-08-10', status: 'processed', receivedFrom: 'Patient Portal Upload', label: 'drivers_license', patientId: 'RD-0001', fileType: 'JPG' },
    { name: 'Signed Consent Form.pdf', documentDate: '2026-08-12', status: 'processed', receivedFrom: 'Jamie Ruiz (CRC)', label: 'legal_document', patientId: 'RD-0001', fileType: 'PDF' },
    { name: 'Outside Lab Results.pdf', documentDate: '2026-08-14', status: 'new', receivedFrom: 'Fax', label: 'other', patientId: 'RD-0002', fileType: 'PDF' },
    { name: 'Referral Letter.pdf', documentDate: '2026-08-15', status: 'new', receivedFrom: 'Referring Provider Office', label: 'other', patientId: 'RD-0003', fileType: 'PDF' },
    { name: 'State ID Card.png', documentDate: '2026-08-16', status: 'processed', receivedFrom: 'Patient Portal Upload', label: 'drivers_license', patientId: 'RD-0002', fileType: 'PNG' },
    { name: 'Power of Attorney.pdf', documentDate: '2026-08-18', status: 'new', receivedFrom: 'Mail', label: 'legal_document', patientId: 'RD-0004', fileType: 'PDF' },
    { name: 'Prior Medication List.pdf', documentDate: '2026-08-19', status: 'processed', receivedFrom: 'Priya Natarajan (CRC)', label: 'other', patientId: 'RD-0004', fileType: 'PDF' },
    { name: 'Insurance Card - Back.jpg', documentDate: '2026-08-20', status: 'new', receivedFrom: 'Patient Portal Upload', label: 'other', patientId: 'RD-0005', fileType: 'JPG' },
    { name: 'Telehealth Consent.pdf', documentDate: '2026-08-21', status: 'processed', receivedFrom: 'Jamie Ruiz (CRC)', label: 'legal_document', patientId: 'RD-0006', fileType: 'PDF' },
    { name: 'Passport Copy.pdf', documentDate: '2026-08-22', status: 'new', receivedFrom: 'Fax', label: 'drivers_license', patientId: 'RD-0003', fileType: 'PDF' },
  ])

  // Faxes: a mix of delivered/failed SIMULATED statuses across several patients
  // and senders, so Fax History is demonstrable without ever implying a real
  // fax was sent (see the disclaimer requirement on the Fax History tab).
  await db.insert(faxes).values([
    { faxDate: new Date('2026-08-10T09:15:00'), subject: 'Lab Results - CBC Panel', documentsIncluded: 'CBC Panel Results.pdf', deliveryStatus: 'delivered', sender: 'Jamie Ruiz (CRC)', sentToFaxNumber: '(555) 010-2201', patientId: 'RD-0001' },
    { faxDate: new Date('2026-08-11T14:32:00'), subject: 'Signed Consent Form', documentsIncluded: 'General Research Consent.pdf', deliveryStatus: 'delivered', sender: 'Jamie Ruiz (CRC)', sentToFaxNumber: '(555) 010-2202', patientId: 'RD-0002' },
    { faxDate: new Date('2026-08-12T11:05:00'), subject: 'Referral Records Request', documentsIncluded: 'Records Request Form.pdf', deliveryStatus: 'failed', sender: 'Priya Natarajan (CRC)', sentToFaxNumber: '(555) 010-2203', patientId: 'RD-0003' },
    { faxDate: new Date('2026-08-13T08:47:00'), subject: 'Prior Authorization', documentsIncluded: 'Prior Auth Request.pdf', deliveryStatus: 'delivered', sender: 'Sam Patel (Admin)', sentToFaxNumber: '(555) 010-2204', patientId: 'RD-0004' },
    { faxDate: new Date('2026-08-14T16:20:00'), subject: 'Medication History', documentsIncluded: 'Medication History.pdf', deliveryStatus: 'delivered', sender: 'Jamie Ruiz (CRC)', sentToFaxNumber: '(555) 010-2205', patientId: 'RD-0005' },
    { faxDate: new Date('2026-08-15T10:00:00'), subject: 'Screening Questionnaire Results', documentsIncluded: 'PHQ-9 Results.pdf, ASRS Results.pdf', deliveryStatus: 'failed', sender: 'Priya Natarajan (CRC)', sentToFaxNumber: '(555) 010-2206', patientId: 'RD-0006' },
    { faxDate: new Date('2026-08-16T13:40:00'), subject: 'Telehealth Consent Confirmation', documentsIncluded: 'Telehealth Consent.pdf', deliveryStatus: 'delivered', sender: 'Jamie Ruiz (CRC)', sentToFaxNumber: '(555) 010-2207', patientId: 'RD-0006' },
    { faxDate: new Date('2026-08-17T09:55:00'), subject: 'Insurance Verification', documentsIncluded: 'Insurance Card Copy.pdf', deliveryStatus: 'delivered', sender: 'Sam Patel (Admin)', sentToFaxNumber: '(555) 010-2208', patientId: 'RD-0002' },
  ])
}

async function seedBilling() {
  const db = getDb()

  const chargeRows = await db.insert(charges).values([
    // Workflow-state charges (not yet submitted -- excluded from A/R).
    {
      patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-14', status: 'draft',
      diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
      procedureCodes: [{ code: '90837', description: 'Psychotherapy, 60 minutes', units: 1, chargeCents: 15000 }],
      amountCents: 15000,
    },
    {
      patientId: 'RD-0002', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-12', status: 'pending_approval',
      diagnosisCodes: [{ code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' }],
      procedureCodes: [{ code: '99214', description: 'Office visit, established patient, moderate complexity', units: 1, chargeCents: 20000 }],
      amountCents: 20000,
    },
    {
      patientId: 'RD-0003', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-10', status: 'pending_approval',
      diagnosisCodes: [{ code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' }],
      procedureCodes: [{ code: '99213', description: 'Office visit, established patient, low complexity', units: 1, chargeCents: 12000 }],
      amountCents: 12000,
    },
    {
      patientId: 'RD-0004', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-08', status: 'approved',
      diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
      procedureCodes: [{ code: '99214', description: 'Office visit, established patient, moderate complexity', units: 1, chargeCents: 18000 }],
      amountCents: 18000,
    },
    {
      patientId: 'RD-0005', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-06', status: 'approved',
      diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
      procedureCodes: [{ code: '99215', description: 'Office visit, established patient, high complexity', units: 1, chargeCents: 22000 }],
      amountCents: 22000,
    },
    // Submitted charges -- these are what the A/R Dashboard and Patient
    // Collections aggregate over. One per aging bucket, plus a second
    // 0-30 charge (RD-0005) used to demonstrate an overpayment/unapplied
    // amount via a mock payment in the block below.
    {
      patientId: 'RD-0001', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-05', status: 'submitted', // 12 days -> 0-30
      diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
      procedureCodes: [{ code: '90837', description: 'Psychotherapy, 60 minutes', units: 1, chargeCents: 15000 }],
      amountCents: 15000,
    },
    {
      patientId: 'RD-0002', providerName: 'Dr. R. Kunam', dateOfService: '2026-08-10', status: 'submitted', // 38 days -> 31-60
      diagnosisCodes: [{ code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' }],
      procedureCodes: [{ code: '99214', description: 'Office visit, established patient, moderate complexity', units: 1, chargeCents: 20000 }],
      amountCents: 20000,
    },
    {
      patientId: 'RD-0003', providerName: 'Dr. R. Kunam', dateOfService: '2026-07-05', status: 'submitted', // 74 days -> 61-90
      diagnosisCodes: [{ code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' }],
      procedureCodes: [{ code: '99213', description: 'Office visit, established patient, low complexity', units: 1, chargeCents: 12500 }],
      amountCents: 12500,
    },
    {
      patientId: 'RD-0006', providerName: 'Dr. R. Kunam', dateOfService: '2026-05-25', status: 'submitted', // 115 days -> 91-120
      diagnosisCodes: [{ code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' }],
      procedureCodes: [{ code: '90837', description: 'Psychotherapy, 60 minutes', units: 2, chargeCents: 30000 }],
      amountCents: 30000,
    },
    {
      patientId: 'RD-0004', providerName: 'Dr. R. Kunam', dateOfService: '2026-03-01', status: 'submitted', // 200 days -> 121+
      diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
      procedureCodes: [{ code: '99214', description: 'Office visit, established patient, moderate complexity', units: 1, chargeCents: 9000 }],
      amountCents: 9000,
    },
    {
      patientId: 'RD-0005', providerName: 'Dr. R. Kunam', dateOfService: '2026-09-01', status: 'submitted', // 16 days -> 0-30
      diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
      procedureCodes: [{ code: '99215', description: 'Office visit, established patient, high complexity', units: 1, chargeCents: 17500 }],
      amountCents: 17500,
    },
  ]).returning()

  const byDos = (dos: string) => chargeRows.find((c) => c.dateOfService === dos)!
  const chargeRd1Submitted = byDos('2026-09-05')
  const chargeRd2Submitted = byDos('2026-08-10')
  const chargeRd3Submitted = byDos('2026-07-05')
  const chargeRd6Submitted = byDos('2026-05-25')
  const chargeRd4Submitted = byDos('2026-03-01')
  const chargeRd5Submitted = byDos('2026-09-01')

  await db.insert(insuranceClaims).values([
    { chargeId: chargeRd1Submitted.id, patientId: 'RD-0001', payerName: 'Blue Shield', billedAmountCents: 15000, paidAmountCents: 15000, status: 'paid', submittedDate: '2026-09-05' },
    { chargeId: chargeRd2Submitted.id, patientId: 'RD-0002', payerName: 'Aetna', billedAmountCents: 20000, paidAmountCents: null, status: 'waiting_adjudication', submittedDate: '2026-08-10' },
    { chargeId: chargeRd3Submitted.id, patientId: 'RD-0003', payerName: 'Cigna', billedAmountCents: 12500, paidAmountCents: 0, status: 'denied', submittedDate: '2026-07-05', notes: 'Missing prior authorization on file.' },
    { chargeId: chargeRd6Submitted.id, patientId: 'RD-0006', payerName: 'United Healthcare', billedAmountCents: 30000, paidAmountCents: null, status: 'needs_investigation', submittedDate: '2026-05-25', notes: 'Payer requesting additional medical records.' },
    { chargeId: chargeRd4Submitted.id, patientId: 'RD-0004', payerName: 'Medicare', billedAmountCents: 9000, paidAmountCents: 0, status: 'rejected', submittedDate: '2026-03-01', notes: 'Invalid procedure code modifier.' },
  ])

  // Two mock payments: one Luhn-valid ("success"), one Luhn-invalid
  // ("failed"). The success payment (RD-0005, $200.00) exceeds its
  // charge's $175.00 balance on purpose, so Patient Collections has a
  // non-zero "unapplied" amount to demonstrate ($25.00).
  await db.insert(mockPayments).values([
    { patientId: 'RD-0005', chargeId: chargeRd5Submitted.id, amountCents: 20000, cardLast4: '4242', expMonth: 12, expYear: 2027, result: 'success', createdAt: new Date('2026-09-02') },
    { patientId: 'RD-0003', chargeId: chargeRd3Submitted.id, amountCents: 12500, cardLast4: '4444', expMonth: 1, expYear: 2028, result: 'failed', createdAt: new Date('2026-07-10') },
  ])

  await db.insert(patientStatements).values([
    { patientId: 'RD-0002', amountCents: 20000, deliveryMethod: 'email', type: 'reminder', deliveryStatus: 'delivered', sentDate: new Date('2026-08-15') },
    { patientId: 'RD-0003', amountCents: 12500, deliveryMethod: 'paper', type: 'initial', deliveryStatus: 'delivered', sentDate: new Date('2026-07-10') },
    { patientId: 'RD-0006', amountCents: 30000, deliveryMethod: 'sms', type: 'final_notice', deliveryStatus: 'failed', sentDate: new Date('2026-08-25') },
    { patientId: 'RD-0004', amountCents: 9000, deliveryMethod: 'email', type: 'reminder', deliveryStatus: 'delivered', sentDate: new Date('2026-09-01') },
  ])
}

async function seedProvidersAndAppointments() {
  const db = getDb()
  const insertedProviders = await db.insert(providers).values(PROVIDER_ROSTER).returning()
  const [kunam, bosch, sundaram, farr, whitfield] = insertedProviders

  // Appointments spread across past (completed/no-show/cancelled), today
  // (2026-09-17), and upcoming dates so Day/Week/Month views and the Home
  // Dashboard's Upcoming Appointments widget all have real demo data.
  await db.insert(appointments).values([
    { patientId: 'RD-0001', providerId: kunam.id, startsAt: new Date('2026-09-10T09:00:00'), endsAt: new Date('2026-09-10T09:30:00'), visitReason: 'Pre-screening follow-up', status: 'completed' },
    { patientId: 'RD-0006', providerId: kunam.id, startsAt: new Date('2026-09-12T14:00:00'), endsAt: new Date('2026-09-12T14:30:00'), visitReason: 'Medication review', status: 'no_show' },
    { patientId: 'RD-0005', providerId: whitfield.id, startsAt: new Date('2026-09-16T11:00:00'), endsAt: new Date('2026-09-16T11:30:00'), visitReason: 'Intake consult', status: 'cancelled' },
    { patientId: 'RD-0002', providerId: bosch.id, startsAt: new Date('2026-09-17T09:00:00'), endsAt: new Date('2026-09-17T09:30:00'), visitReason: 'PHQ-9 rescreen', status: 'scheduled' },
    { patientId: 'RD-0004', providerId: sundaram.id, startsAt: new Date('2026-09-17T10:30:00'), endsAt: new Date('2026-09-17T11:00:00'), visitReason: 'ASRS follow-up', status: 'scheduled' },
    { patientId: 'RD-0003', providerId: farr.id, startsAt: new Date('2026-09-18T13:00:00'), endsAt: new Date('2026-09-18T13:30:00'), visitReason: 'Identity verification appointment', status: 'scheduled' },
    { patientId: 'RD-0007', providerId: kunam.id, startsAt: new Date('2026-09-19T09:00:00'), endsAt: new Date('2026-09-19T09:30:00'), visitReason: 'New patient intake', status: 'scheduled' },
    { patientId: 'RD-0008', providerId: bosch.id, startsAt: new Date('2026-09-22T15:00:00'), endsAt: new Date('2026-09-22T15:30:00'), visitReason: 'Screening visit', status: 'scheduled' },
    { patientId: 'RD-0009', providerId: whitfield.id, startsAt: new Date('2026-09-24T10:00:00'), endsAt: new Date('2026-09-24T10:30:00'), visitReason: 'Consent review', status: 'scheduled' },
    { patientId: 'RD-0010', providerId: sundaram.id, startsAt: new Date('2026-09-25T09:30:00'), endsAt: new Date('2026-09-25T10:00:00'), visitReason: 'Baseline rating scale', status: 'scheduled' },
    { patientId: 'RD-0011', providerId: farr.id, startsAt: new Date('2026-09-29T13:30:00'), endsAt: new Date('2026-09-29T14:00:00'), visitReason: 'Follow-up visit', status: 'scheduled' },
    { patientId: 'RD-0012', providerId: kunam.id, startsAt: new Date('2026-09-30T11:00:00'), endsAt: new Date('2026-09-30T11:30:00'), visitReason: 'Randomization visit', status: 'scheduled' },
  ])
}

async function clearExistingData() {
  const db = getDb()
  // Delete in FK-safe order (children before parents) so seed() is safely re-runnable
  // against the live database without unique-constraint violations.
  await db.delete(faxes)
  await db.delete(documents)
  await db.delete(mockPayments)
  await db.delete(patientStatements)
  await db.delete(insuranceClaims)
  await db.delete(charges)
  await db.delete(screeningCriteriaResults)
  await db.delete(patientTrialScreenings)
  await db.delete(medicationEpisodes)
  await db.delete(diagnoses)
  await db.delete(identityMatches)
  await db.delete(formSubmissions)
  await db.delete(allergies)
  await db.delete(identityVerifications)
  await db.delete(appSettings)
  await db.delete(formTemplates)
  await db.delete(appointments)
  await db.delete(patients)
  await db.delete(providers)
  await db.delete(users)
  await db.delete(trials)
}

export async function seed() {
  const db = getDb()

  // Guard against re-seeding a shared dev database that already has data.
  // Several parallel feature branches now have their own tables with FK
  // references into `patients`/`formSubmissions` (appointments, charges,
  // reviews, ...) that this branch's schema doesn't know about, so a full
  // clear-and-reinsert here can no longer safely delete those two tables --
  // it would abort partway through with a foreign-key violation and leave
  // whatever it deleted first empty. If the DB is already seeded, skip the
  // destructive cycle entirely and leave existing data alone.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(patients)
  if (count > 0) {
    console.log(`Seed skipped: patients table already has ${count} row(s).`)
    // Even when patients is already seeded, this branch's own new tables
    // (providers/appointments, charges/insuranceClaims/patientStatements/
    // mockPayments, documents/faxes) might not be -- e.g. a shared dev
    // database seeded by a sibling branch before this branch's schema
    // existed. Top those up without touching anything else: every top-up
    // function only inserts into tables this branch owns exclusively,
    // against patients rows already confirmed present, so none carries the
    // deletion/FK risk clearExistingData() has.
    const [{ providerCount }] = await db.select({ providerCount: sql<number>`count(*)::int` }).from(providers)
    if (providerCount === 0) {
      await seedProvidersAndAppointments()
      console.log('Seeded providers/appointments (patients table was already populated).')
    }
    const [{ chargeCount }] = await db.select({ chargeCount: sql<number>`count(*)::int` }).from(charges)
    if (chargeCount === 0) {
      await seedBilling()
      console.log('Seeded billing (charges/claims/payments/statements) (patients table was already populated).')
    }
    const [{ documentCount }] = await db.select({ documentCount: sql<number>`count(*)::int` }).from(documents)
    if (documentCount === 0) {
      await seedDocumentsAndFaxes()
      console.log('Seeded documents/faxes (patients table was already populated).')
    }
    return
  }

  await clearExistingData()

  await db.insert(trials).values([MDD_TRIAL, ADHD_TRIAL])

  await db.insert(users).values([
    { name: 'Jamie Ruiz', email: 'jruiz.demo@example.com', role: 'crc' },
    { name: 'Dr. R. Kunam', email: 'rkunam.demo@example.com', role: 'pi' },
    { name: 'Sam Patel', email: 'spatel.demo@example.com', role: 'admin' },
  ])

  for (const p of HERO_PATIENTS) {
    await db.insert(patients).values({
      id: p.id,
      intakeqClientIdEncrypted: `enc-iq-${p.id}`,
      tebraPatientIdEncrypted: p.nameTebra ? `enc-tb-${p.id}` : null,
      nameIntakeq: p.nameIntakeq,
      nameTebra: p.nameTebra,
      dobIntakeq: p.dobIntakeq,
      dobTebra: p.dobTebra,
      cityIntakeq: p.city,
      zipIntakeq: p.zip,
      phoneIntakeq: p.phone,
      emailIntakeq: p.emailIntakeq,
      emailTebra: p.emailTebra,
      currentProvider: p.provider,
      ratingScales: [p.ratingScale],
      referralType: 'Provider referral',
      availability: 'Weekday mornings',
      commConsentSigned: true,
      commConsentPref: 'Phone',
    })

    await db.insert(diagnoses).values({ patientId: p.id, code: p.diagnosisCode.code, description: p.diagnosisCode.description, source: 'tebra', date: '2025-01-15' })
    if (p.activeMed.name !== 'Unknown' && p.activeMed.name !== 'None') {
      await db.insert(medicationEpisodes).values({ patientId: p.id, name: p.activeMed.name, medicationClass: p.activeMed.medicationClass, dose: p.activeMed.dose, startDate: p.activeMed.startDate, status: 'active' })
    }

    const screening = await db.insert(patientTrialScreenings).values({ patientId: p.id, trialId: p.trialId, overallStatus: p.overallStatus }).returning()
    for (const c of p.criteria) {
      await db.insert(screeningCriteriaResults).values({ screeningId: screening[0].id, criterionKey: c.key, criterionText: c.text, verdict: c.verdict, evidenceQuote: c.quote, evidenceSourceDoc: c.sourceDoc, evidenceSourceDate: c.sourceDate })
    }
  }

  await seedFillerPatients()
  await seedProvidersAndAppointments()
  await seedBilling()
  await seedDocumentsAndFaxes()

  await db.insert(identityMatches).values([
    { intakeqClientIdEncrypted: 'enc-iq-pending-01', referralName: 'Linda Cho', referralDob: '1978-06-30', candidateTebraPatientIdEncrypted: 'enc-tb-cand-01', candidateName: 'Linda M. Cho', candidateDob: '1978-06-30', confidence: 72, status: 'pending' },
    { intakeqClientIdEncrypted: 'enc-iq-pending-02', referralName: 'Katherine Voss', referralDob: '1982-12-05', candidateTebraPatientIdEncrypted: 'enc-tb-cand-02', candidateName: 'Kathryn Voss', candidateDob: '1982-12-05', confidence: 88, status: 'pending' },
  ])

  // Form templates: one per trial condition, each with a handful of
  // realistic intake questions including at least one hipaaSensitive field.
  const [mddTemplate] = await db.insert(formTemplates).values({
    name: 'MDD Intake Packet',
    category: 'Trial Intake',
    diagnosisTag: 'Major Depressive Disorder',
    questions: [
      { id: 'q1', label: 'Full legal name', type: 'text', hipaaSensitive: true, required: true, autofillField: 'name' },
      { id: 'q2', label: 'Date of birth', type: 'date', hipaaSensitive: true, required: true, autofillField: 'dob' },
      { id: 'q3', label: 'Current mood symptoms (describe)', type: 'textarea', hipaaSensitive: true, required: true },
      { id: 'q4', label: 'Currently taking antidepressants?', type: 'select', options: ['Yes', 'No'], hipaaSensitive: true, required: true },
      { id: 'q5', label: 'Consent to share records with study team', type: 'checkbox', hipaaSensitive: false, required: true },
    ],
  }).returning()

  const [adhdTemplate] = await db.insert(formTemplates).values({
    name: 'ADHD Intake Packet',
    category: 'Trial Intake',
    diagnosisTag: 'ADHD',
    questions: [
      { id: 'q1', label: 'Full legal name', type: 'text', hipaaSensitive: true, required: true, autofillField: 'name' },
      { id: 'q2', label: 'Date of birth', type: 'date', hipaaSensitive: true, required: true, autofillField: 'dob' },
      { id: 'q3', label: 'Current stimulant medication (if any)', type: 'text', hipaaSensitive: true, required: false },
      { id: 'q4', label: 'Consent to share records with study team', type: 'checkbox', hipaaSensitive: false, required: true },
    ],
  }).returning()

  // Non-trial-specific templates, matching IntakeQ's Consent Forms / Screening
  // Questionnaires / Note Templates folders (adapted to what a trial
  // pre-screening pilot actually needs, not a full outpatient-practice clone).
  await db.insert(formTemplates).values([
    {
      name: 'General Research Consent',
      category: 'Consent Forms',
      diagnosisTag: 'General',
      questions: [
        { id: 'q1', label: 'I consent to my de-identified data being used for research purposes', type: 'checkbox', hipaaSensitive: false, required: true },
        { id: 'q2', label: 'Signature (typed full name)', type: 'text', hipaaSensitive: true, required: true },
        { id: 'q3', label: 'Date', type: 'date', hipaaSensitive: false, required: true },
      ],
    },
    {
      name: 'Telehealth Consent',
      category: 'Consent Forms',
      diagnosisTag: 'General',
      questions: [
        { id: 'q1', label: 'I consent to receiving care via telehealth', type: 'checkbox', hipaaSensitive: false, required: true },
        { id: 'q2', label: 'Signature (typed full name)', type: 'text', hipaaSensitive: true, required: true },
      ],
    },
    {
      name: 'PHQ-9 (Depression Screening)',
      category: 'Screening Questionnaires',
      diagnosisTag: 'Major Depressive Disorder',
      questions: [
        { id: 'q1', label: 'Little interest or pleasure in doing things', type: 'select', options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'], hipaaSensitive: true, required: true },
        { id: 'q2', label: 'Feeling down, depressed, or hopeless', type: 'select', options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'], hipaaSensitive: true, required: true },
      ],
    },
    {
      name: 'ASRS-v1.1 (ADHD Screening)',
      category: 'Screening Questionnaires',
      diagnosisTag: 'ADHD',
      questions: [
        { id: 'q1', label: 'How often do you have trouble wrapping up the final details of a project?', type: 'select', options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'], hipaaSensitive: true, required: true },
      ],
    },
  ])

  // Form submissions: a spread of sent/partial/completed across seeded patients.
  await db.insert(formSubmissions).values([
    { templateId: mddTemplate.id, patientId: 'RD-0001', status: 'completed', sentDate: new Date('2026-08-10'), completedDate: new Date('2026-08-15'), answers: { q1: 'Maria Alvarez', q4: 'Yes' } },
    { templateId: mddTemplate.id, patientId: 'RD-0002', status: 'completed', sentDate: new Date('2026-08-16'), completedDate: new Date('2026-08-20'), answers: { q1: 'James Thornton', q4: 'Yes' } },
    { templateId: mddTemplate.id, patientId: 'RD-0003', status: 'sent', sentDate: new Date('2026-08-25') },
    { templateId: mddTemplate.id, patientId: 'RD-0006', status: 'partial', sentDate: new Date('2026-08-18'), answers: { q1: 'Kathryn Voss' } },
    { templateId: adhdTemplate.id, patientId: 'RD-0004', status: 'completed', sentDate: new Date('2026-08-17'), completedDate: new Date('2026-08-22'), answers: { q1: 'Priya Natarajan' } },
    { templateId: adhdTemplate.id, patientId: 'RD-0005', status: 'sent', sentDate: new Date('2026-08-24') },
  ])

  // Allergies for a subset of patients.
  await db.insert(allergies).values([
    { patientId: 'RD-0001', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate' },
    { patientId: 'RD-0002', allergen: 'Sulfa drugs', reaction: 'Hives', severity: 'severe' },
    { patientId: 'RD-0006', allergen: 'Latex', reaction: 'Contact dermatitis', severity: 'mild' },
  ])

  // Identity verification: a mix of verified and pending.
  await db.insert(identityVerifications).values([
    { patientId: 'RD-0001', idType: 'drivers_license', idNumberEncrypted: encryptSensitive('D1234567'), verified: true, verifiedBy: 'Jamie Ruiz', verifiedAt: new Date('2026-08-16') },
    { patientId: 'RD-0002', idType: 'state_id', idNumberEncrypted: encryptSensitive('S7654321'), verified: true, verifiedBy: 'Jamie Ruiz', verifiedAt: new Date('2026-08-21') },
    { patientId: 'RD-0003', idType: 'passport', idNumberEncrypted: encryptSensitive('P9988776'), verified: false },
  ])

  // Default settings row (auto-classify off by default).
  await db.insert(appSettings).values({ autoClassifyOnComplete: false })
}

if (require.main === module) {
  seed().then(() => { console.log('Seed complete'); process.exit(0) })
}

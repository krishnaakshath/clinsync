import { getDb } from './client'
import {
  trials,
  patients,
  diagnoses,
  medicationEpisodes,
  patientTrialScreenings,
  screeningCriteriaResults,
  identityMatches,
  users,
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
  name: 'Extended-Release Stimulant Response Study (demo)',
  nctNumber: 'NCT-DEMO-0001',
  condition: 'ADHD',
  site: 'Redlands',
  studyDrug: 'DEMO-STIM-01',
  ageMin: 18,
  ageMax: 55,
  diagnosisCodes: [{ code: 'F90.2', description: 'Attention-deficit hyperactivity disorder, combined type' }],
  ratingScales: [{ name: 'ASRS-v1.1', description: 'Adult ADHD Self-Report Scale' }],
  medicationClasses: [{ className: 'Stimulant', washoutDays: 14, rule: 'No stimulant medication within the last 14 days' }],
}

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

async function clearExistingData() {
  const db = getDb()
  // Delete in FK-safe order (children before parents) so seed() is safely re-runnable
  // against the live database without unique-constraint violations.
  await db.delete(screeningCriteriaResults)
  await db.delete(patientTrialScreenings)
  await db.delete(medicationEpisodes)
  await db.delete(diagnoses)
  await db.delete(identityMatches)
  await db.delete(patients)
  await db.delete(users)
  await db.delete(trials)
}

export async function seed() {
  const db = getDb()
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

  await db.insert(identityMatches).values([
    { intakeqClientIdEncrypted: 'enc-iq-pending-01', referralName: 'Linda Cho', referralDob: '1978-06-30', candidateTebraPatientIdEncrypted: 'enc-tb-cand-01', candidateName: 'Linda M. Cho', candidateDob: '1978-06-30', confidence: 72, status: 'pending' },
    { intakeqClientIdEncrypted: 'enc-iq-pending-02', referralName: 'Katherine Voss', referralDob: '1982-12-05', candidateTebraPatientIdEncrypted: 'enc-tb-cand-02', candidateName: 'Kathryn Voss', candidateDob: '1982-12-05', confidence: 88, status: 'pending' },
  ])
}

if (require.main === module) {
  seed().then(() => { console.log('Seed complete'); process.exit(0) })
}

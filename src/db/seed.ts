import { getDb } from './client'
import { encryptSensitive } from '../lib/crypto'
import { eq, and, sql } from 'drizzle-orm'
import {
  trials,
  patients,
  diagnoses,
  medicationEpisodes,
  patientTrialScreenings,
  screeningCriteriaResults,
  identityMatches,
  users,
  formTemplates,
  formSubmissions,
  allergies,
  identityVerifications,
  appSettings,
  broadcasts,
  reviews,
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
  await db.delete(reviews)
  await db.delete(broadcasts)
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
  await db.delete(patients)
  await db.delete(users)
  await db.delete(trials)
}

export async function seed() {
  const db = getDb()

  // Guard against re-seeding a shared dev database that already has data --
  // sibling feature branches now have tables with FK references into
  // `patients`/`formSubmissions` that this branch's schema doesn't know
  // about, so a full clear-and-reinsert can no longer safely delete those
  // two tables without aborting partway through. Skip entirely if seeded.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(patients)
  if (count > 0) {
    console.log(`Seed skipped: patients table already has ${count} row(s).`)
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
      { id: 'q1', label: 'Full legal name', type: 'text', hipaaSensitive: true, required: true },
      { id: 'q2', label: 'Date of birth', type: 'date', hipaaSensitive: true, required: true },
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
      { id: 'q1', label: 'Full legal name', type: 'text', hipaaSensitive: true, required: true },
      { id: 'q2', label: 'Date of birth', type: 'date', hipaaSensitive: true, required: true },
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

  // Phase 5: stagger dateAdded/chartDataAsOf for a handful of patients so the
  // Pipeline Performance Dashboard's date-range filters and "average days
  // referral -> classification" KPI have real spread to show, instead of
  // every patient landing at the exact instant this script ran. This only
  // updates data values on the pre-existing `patients` table (not its
  // schema), for the same reason Phase 1's seed script freely inserts into
  // pre-existing tables like `diagnoses` — no phase "owns" `patients`
  // exclusively, and no column definition is changed here.
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
  await db.update(patients).set({ dateAdded: daysAgo(35), chartDataAsOf: daysAgo(28) }).where(eq(patients.id, 'RD-0001'))
  await db.update(patients).set({ dateAdded: daysAgo(20), chartDataAsOf: daysAgo(15) }).where(eq(patients.id, 'RD-0002'))
  await db.update(patients).set({ dateAdded: daysAgo(12), chartDataAsOf: daysAgo(9) }).where(eq(patients.id, 'RD-0003'))
  await db.update(patients).set({ dateAdded: daysAgo(8), chartDataAsOf: daysAgo(6) }).where(eq(patients.id, 'RD-0004'))
  await db.update(patients).set({ dateAdded: daysAgo(3), chartDataAsOf: daysAgo(1) }).where(eq(patients.id, 'RD-0005'))
  await db.update(patients).set({ dateAdded: daysAgo(2) }).where(eq(patients.id, 'RD-0006')) // not yet (re)classified

  // Broadcasts: a spread of channels, filters, and simulated delivery outcomes.
  await db.insert(broadcasts).values([
    {
      message: 'Reminder: your MDD trial intake packet is still open. Please finish it before your next visit.',
      channel: 'sms',
      filterTrialId: 'nct06911112',
      filterOverallStatus: 'yellow',
      filterFormStatus: null,
      recipients: [
        { patientId: 'RD-0003', patientName: 'Linda Cho', deliveryStatus: 'delivered' },
        { patientId: 'RD-0006', patientName: 'Kathryn Voss', deliveryStatus: 'delivered' },
      ],
      recipientCount: 2,
      sentBy: 'Jamie Ruiz',
      sentAt: daysAgo(10),
    },
    {
      subject: 'Your ADHD study forms are complete — next steps',
      message: 'Thank you for completing your intake packet. The study coordinator will call you within 2 business days to schedule your screening visit.',
      channel: 'email',
      filterTrialId: 'nct-adhd-demo-01',
      filterOverallStatus: null,
      filterFormStatus: 'completed',
      recipients: [
        { patientId: 'RD-0004', patientName: 'Priya Natarajan', deliveryStatus: 'delivered' },
      ],
      recipientCount: 1,
      sentBy: 'Jamie Ruiz',
      sentAt: daysAgo(6),
    },
    {
      subject: 'Please complete your intake forms',
      message: "We noticed your intake packet hasn't been started yet. Please complete it as soon as possible so we can continue your pre-screening.",
      channel: 'both',
      filterTrialId: null,
      filterOverallStatus: null,
      filterFormStatus: 'sent',
      recipients: [
        { patientId: 'RD-0003', patientName: 'Linda Cho', deliveryStatus: 'delivered' },
        { patientId: 'RD-0005', patientName: 'Marcus Webb', deliveryStatus: 'failed' },
      ],
      recipientCount: 2,
      sentBy: 'Sam Patel',
      sentAt: daysAgo(4),
    },
    {
      message: 'This is a routine check-in from the study team — reply if you have questions about your upcoming visit.',
      channel: 'sms',
      filterTrialId: null,
      filterOverallStatus: null,
      filterFormStatus: null,
      recipients: [
        { patientId: 'RD-0001', patientName: 'Maria Alvarez', deliveryStatus: 'delivered' },
        { patientId: 'RD-0002', patientName: 'James Thornton', deliveryStatus: 'delivered' },
        { patientId: 'RD-0007', patientName: 'Robert Nguyen', deliveryStatus: 'failed' },
      ],
      recipientCount: 3,
      sentBy: 'Jamie Ruiz',
      sentAt: daysAgo(1),
    },
  ])

  // Reviews: Pre-Screening Experience Survey responses tied to Phase 1's
  // completed form submissions for RD-0001, RD-0002, and RD-0004.
  const [rd0001Submission] = await db.select().from(formSubmissions).where(and(eq(formSubmissions.patientId, 'RD-0001'), eq(formSubmissions.status, 'completed')))
  const [rd0002Submission] = await db.select().from(formSubmissions).where(and(eq(formSubmissions.patientId, 'RD-0002'), eq(formSubmissions.status, 'completed')))
  const [rd0004Submission] = await db.select().from(formSubmissions).where(and(eq(formSubmissions.patientId, 'RD-0004'), eq(formSubmissions.status, 'completed')))

  await db.insert(reviews).values([
    {
      patientId: 'RD-0001',
      formSubmissionId: rd0001Submission.id,
      status: 'completed',
      sentAt: daysAgo(27),
      respondedAt: daysAgo(25),
      ratingOverall: 5,
      ratingFormsClarity: 5,
      ratingCommunication: 4,
      comments: 'The intake process was clear and the coordinator was very responsive.',
      sentBy: 'Jamie Ruiz',
    },
    {
      patientId: 'RD-0002',
      formSubmissionId: rd0002Submission.id,
      status: 'sent',
      sentAt: daysAgo(14),
      sentBy: 'Jamie Ruiz',
    },
    {
      patientId: 'RD-0004',
      formSubmissionId: rd0004Submission.id,
      status: 'completed',
      sentAt: daysAgo(8),
      respondedAt: daysAgo(7),
      ratingOverall: 3,
      ratingFormsClarity: 3,
      ratingCommunication: 4,
      comments: 'Forms were a bit long but staff followed up quickly.',
      sentBy: 'Jamie Ruiz',
    },
  ])
}

if (require.main === module) {
  seed().then(() => { console.log('Seed complete'); process.exit(0) })
}

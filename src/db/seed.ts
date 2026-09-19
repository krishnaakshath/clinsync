import { sql, eq } from 'drizzle-orm'
import { getDb } from './client'
import { encryptSensitive } from '../lib/crypto'
import { hashPassword } from '../lib/password'
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
  providers,
  appointments,
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
  medicationClasses: [
    { className: 'SSRI/SNRI antidepressant', washoutDays: 56, rule: 'On current antidepressant dose for at least 8 weeks', ruleType: 'required_stable' as const },
    { className: 'NDRI (excluded class)', washoutDays: 0, rule: 'Not currently on an excluded medication class', ruleType: 'washout_exclusion' as const },
  ],
  exclusionDiagnoses: [
    { code: 'F20.9', description: 'Schizophrenia, unspecified' },
    { code: 'F31.9', description: 'Bipolar disorder, unspecified (manic features exclude MDD-only protocol)' },
    { code: 'F10.20', description: 'Alcohol use disorder, moderate' },
  ],
  minRatingScaleScore: 10,
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
  medicationClasses: [{ className: 'Stimulant', washoutDays: 14, rule: 'No stimulant medication within the last 14 days', ruleType: 'washout_exclusion' as const }],
  exclusionDiagnoses: [
    { code: 'F20.9', description: 'Schizophrenia, unspecified' },
    { code: 'F10.20', description: 'Alcohol use disorder, moderate' },
  ],
  minRatingScaleScore: 14,
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

// A larger, more varied roster than a handful of near-identical demo rows --
// meant to read like an actual clinic's patient panel (mixed ages, cities,
// diagnoses, referral sources), not just enough rows to exercise the UI.
// Criterion keys among HERO_PATIENTS' hand-authored demo criteria that are
// actually exclusion rules -- everything else defaults to inclusion. Only
// matters for the initial seed's display; the real evaluator (lib/eligibility.ts)
// tags every criterion it generates directly and supersedes these on the
// first Refresh/Run Classification.
const EXCLUSION_CRITERION_KEYS = new Set(['excluded-medication', 'stimulant-washout'])

const FILLER_NAMES = [
  'Robert Nguyen', 'Angela Ferraro', 'Devon Okafor', 'Sana Patel', 'Wesley Turner', 'Isabel Marquez',
  'Owen Fitzgerald', 'Grace Kim', 'Tobias Reyes', 'Nadia Suleiman', 'Colin Brantley', 'Fatima Rashid',
  'Marcus Bellweather', 'Priya Chandrasekaran', 'Diego Salgado', 'Yasmin Haddad', 'Trevor Osei', 'Lena Kowalski',
  'Anthony Delgado', 'Rina Fujimoto', 'Samuel Okonkwo', 'Chloe Bergstrom', 'Amir Farouk', 'Danielle Whitfield',
  'Hassan Malik', 'Sophia Papadakis', 'Elijah Cross', 'Mei Lin Tan', 'Gabriel Ontiveros', 'Renee Castellano',
  'Kwame Asante', 'Ingrid Solheim', 'Julian Restrepo', 'Aaliyah Jefferson', 'Noah Feldman', 'Camille Dubois',
  'Tariq Abbasi', 'Whitney Sorensen', 'Mateo Villareal', 'Simone Achebe', 'Declan O’Farrell', 'Priyanka Deshmukh',
  'Zachary Huang', 'Beatriz Nascimento',
]

const CITY_POOL = [
  { city: 'Redlands', zip: '92373' }, { city: 'Redlands', zip: '92374' }, { city: 'Highland', zip: '92346' },
  { city: 'Yucaipa', zip: '92399' }, { city: 'Loma Linda', zip: '92354' }, { city: 'San Bernardino', zip: '92404' },
  { city: 'Riverside', zip: '92501' }, { city: 'Colton', zip: '92324' }, { city: 'Rialto', zip: '92376' },
  { city: 'Beaumont', zip: '92223' }, { city: 'Banning', zip: '92220' }, { city: 'Calimesa', zip: '92320' },
]

const REFERRAL_TYPES = ['Self-referral', 'Provider referral', 'Community outreach', 'Insurance panel referral']
const AVAILABILITY_OPTIONS = ['Weekday mornings', 'Weekday afternoons', 'Evenings only', 'Flexible', 'Weekends only']

// A broader diagnosis/medication pool than just the two active trials'
// conditions -- most of a real clinic's panel isn't enrolled in either
// study, which is exactly why most of these patients get no trial
// screening row at all (see seedFillerPatients below).
const GENERAL_DIAGNOSES = [
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'F43.10', description: 'Post-traumatic stress disorder' },
  { code: 'F31.81', description: 'Bipolar II disorder' },
  { code: 'F41.0', description: 'Panic disorder' },
  { code: 'F42.2', description: 'Mixed obsessional thoughts and acts' },
  { code: 'G47.00', description: 'Insomnia, unspecified' },
  { code: 'F10.20', description: 'Alcohol use disorder, moderate' },
  { code: 'F60.3', description: 'Borderline personality disorder' },
]

const GENERAL_MEDICATIONS = [
  { name: 'Fluoxetine', medicationClass: 'SSRI/SNRI antidepressant', dose: '20mg daily' },
  { name: 'Escitalopram', medicationClass: 'SSRI/SNRI antidepressant', dose: '10mg daily' },
  { name: 'Duloxetine', medicationClass: 'SSRI/SNRI antidepressant', dose: '60mg daily' },
  { name: 'Lamotrigine', medicationClass: 'Mood stabilizer', dose: '100mg daily' },
  { name: 'Aripiprazole', medicationClass: 'Atypical antipsychotic', dose: '5mg daily' },
  { name: 'Buspirone', medicationClass: 'Anxiolytic', dose: '15mg twice daily' },
  { name: 'Hydroxyzine', medicationClass: 'Antihistamine anxiolytic', dose: '25mg as needed' },
  { name: 'Vyvanse', medicationClass: 'Stimulant', dose: '40mg daily' },
]

async function seedFillerPatients() {
  const db = getDb()
  for (let i = 0; i < FILLER_NAMES.length; i++) {
    const id = `RD-${String(7 + i).padStart(4, '0')}`

    // Safe to re-run against an already-populated shared dev DB: skip any id
    // that already exists (e.g. a real patient a user created by hand
    // through the app that happens to land on the same anon-id slot) rather
    // than failing or duplicating.
    const [existing] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id))
    if (existing) continue

    const [first, last] = FILLER_NAMES[i].split(' ')
    const location = CITY_POOL[i % CITY_POOL.length]
    const birthYear = 1955 + (i * 7) % 50 // spreads ages roughly 18-70
    const birthMonth = String((i % 12) + 1).padStart(2, '0')
    const birthDay = String(((i * 3) % 27) + 1).padStart(2, '0')
    const inTrial = i % 3 !== 2 // ~2/3 of the panel is enrolled in one of the two active trials; the rest is general-population patients not part of either study
    const trial = i % 2 === 0 ? MDD_TRIAL : ADHD_TRIAL
    const status: 'green' | 'yellow' | 'red' = ['green', 'green', 'yellow', 'red'][i % 4] as 'green' | 'yellow' | 'red'

    await db.insert(patients).values({
      id,
      intakeqClientIdRef: `enc-iq-${id}`,
      tebraPatientIdRef: i % 5 === 4 ? null : `enc-tb-${id}`, // a few unmatched-to-Tebra, like the hero roster's Linda Cho
      nameIntakeq: FILLER_NAMES[i],
      nameTebra: i % 5 === 4 ? null : FILLER_NAMES[i],
      dobIntakeq: `${birthYear}-${birthMonth}-${birthDay}`,
      dobTebra: i % 5 === 4 ? null : `${birthYear}-${birthMonth}-${birthDay}`,
      cityIntakeq: location.city,
      zipIntakeq: location.zip,
      phoneIntakeq: `909-555-0${String(300 + i).padStart(3, '0')}`,
      emailIntakeq: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}.demo@example.com`,
      currentProvider: PROVIDER_ROSTER[i % PROVIDER_ROSTER.length].name,
      ratingScales: inTrial ? [{ name: trial.ratingScales[0].name, score: 8 + (i % 16), date: '2026-09-01' }] : [],
      referralType: REFERRAL_TYPES[i % REFERRAL_TYPES.length],
      availability: AVAILABILITY_OPTIONS[i % AVAILABILITY_OPTIONS.length],
      commConsentSigned: i % 4 !== 3,
      commConsentPref: ['Phone', 'Email', 'Text'][i % 3],
    })

    if (inTrial) {
      await db.insert(diagnoses).values({ patientId: id, code: trial.diagnosisCodes[0].code, description: trial.diagnosisCodes[0].description, source: 'tebra', date: '2026-08-01' })
      const screening = await db.insert(patientTrialScreenings).values({ patientId: id, trialId: trial.id, overallStatus: status }).returning()
      await db.insert(screeningCriteriaResults).values({
        screeningId: screening[0].id,
        criterionKey: 'diagnosis',
        criterionText: `Confirmed ${trial.condition} diagnosis`,
        criterionType: 'inclusion',
        verdict: status,
        evidenceQuote: `Dx: ${trial.diagnosisCodes[0].code} ${trial.diagnosisCodes[0].description}`,
        evidenceSourceDoc: 'Tebra Condition list',
        evidenceSourceDate: '2026-08-01',
      })
    } else {
      // General-population patient, not part of either active study --
      // still a real chart with its own diagnosis, so the panel doesn't
      // read as "trial candidates only."
      const dx = GENERAL_DIAGNOSES[i % GENERAL_DIAGNOSES.length]
      await db.insert(diagnoses).values({ patientId: id, code: dx.code, description: dx.description, source: 'tebra', date: '2026-07-15' })
    }

    // Roughly half the panel has an active medication on file, drawn from a
    // pool wide enough that the Medications view doesn't look like everyone
    // is on the same drug.
    if (i % 2 === 0) {
      const med = GENERAL_MEDICATIONS[i % GENERAL_MEDICATIONS.length]
      await db.insert(medicationEpisodes).values({ patientId: id, name: med.name, medicationClass: med.medicationClass, dose: med.dose, startDate: '2026-06-01', status: 'active' })
    }

    // A handful of allergies, since real charts aren't uniformly blank here.
    if (i % 6 === 0) {
      const allergy = [{ allergen: 'Penicillin', reaction: 'Rash' }, { allergen: 'Sulfa drugs', reaction: 'Hives' }, { allergen: 'Latex', reaction: 'Contact dermatitis' }, { allergen: 'Shellfish', reaction: 'Anaphylaxis' }][i % 4]
      await db.insert(allergies).values({ patientId: id, allergen: allergy.allergen, reaction: allergy.reaction, severity: (['mild', 'moderate', 'severe'] as const)[i % 3] })
    }
  }
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

// Spreads a few appointments across the expanded filler roster (RD-0020+)
// so the Calendar and the Home dashboard's Upcoming Appointments widget
// reflect the fuller panel too, not just the original 12 demo patients.
// Idempotent: skips any patient that already has an appointment on file.
async function seedAdditionalAppointmentsForExpandedRoster() {
  const db = getDb()
  const rosterProviders = await db.select().from(providers)
  if (rosterProviders.length === 0) return

  const VISIT_REASONS = ['New patient intake', 'Medication review', 'Follow-up visit', 'Screening visit', 'Consent review', 'Baseline rating scale']
  let dayOffset = 3

  for (let i = 12; i < FILLER_NAMES.length; i++) {
    const id = `RD-${String(7 + i).padStart(4, '0')}`
    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id))
    if (!patient) continue // this id was skipped in seedFillerPatients (e.g. a real user-created patient already occupies it)
    if (i % 2 !== 0) continue // spread appointments across roughly half of the new roster, not every patient

    const [existingAppt] = await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.patientId, id))
    if (existingAppt) continue

    const provider = rosterProviders[i % rosterProviders.length]
    const startsAt = new Date(`2026-10-${String(1 + (dayOffset % 28)).padStart(2, '0')}T${String(9 + (i % 6)).padStart(2, '0')}:00:00`)
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000)
    dayOffset += 2

    await db.insert(appointments).values({
      patientId: id,
      providerId: provider.id,
      startsAt,
      endsAt,
      visitReason: VISIT_REASONS[i % VISIT_REASONS.length],
      status: 'scheduled',
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
    // (providers/appointments) might not be -- e.g. a shared dev database
    // seeded by a sibling branch before this branch's schema existed. Top
    // those up without touching anything else: seedProvidersAndAppointments
    // only inserts into two tables this branch owns exclusively, against
    // patients rows already confirmed present, so it carries none of the
    // deletion/FK risk clearExistingData() has.
    const [{ providerCount }] = await db.select({ providerCount: sql<number>`count(*)::int` }).from(providers)
    if (providerCount === 0) {
      await seedProvidersAndAppointments()
      console.log('Seeded providers/appointments (patients table was already populated).')
    }
    // seedFillerPatients() skips any id that already exists, so it's safe to
    // call again here to top up the roster with any new FILLER_NAMES entries
    // added since this database was first seeded.
    await seedFillerPatients()
    await seedAdditionalAppointmentsForExpandedRoster()
    return
  }

  await clearExistingData()

  await db.insert(trials).values([MDD_TRIAL, ADHD_TRIAL])

  await db.insert(users).values([
    // Demo credentials for the pilot's pi/crc roles, so login isn't
    // admin-only. The real admin account (support@symbiosystech.com) still
    // authenticates via ADMIN_EMAIL/ADMIN_PASSWORD_HASH, never through this
    // table -- Sam Patel's row here is inert demo data with no password.
    { name: 'Jamie Ruiz', email: 'jruiz.demo@example.com', role: 'crc', passwordHash: hashPassword('CoordinatorDemo123!') },
    { name: 'Dr. R. Kunam', email: 'rkunam.demo@example.com', role: 'pi', passwordHash: hashPassword('DoctorDemo123!') },
    { name: 'Sam Patel', email: 'spatel.demo@example.com', role: 'admin' },
  ])

  for (const p of HERO_PATIENTS) {
    await db.insert(patients).values({
      id: p.id,
      intakeqClientIdRef: `enc-iq-${p.id}`,
      tebraPatientIdRef: p.nameTebra ? `enc-tb-${p.id}` : null,
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
      await db.insert(screeningCriteriaResults).values({ screeningId: screening[0].id, criterionKey: c.key, criterionText: c.text, criterionType: EXCLUSION_CRITERION_KEYS.has(c.key) ? 'exclusion' : 'inclusion', verdict: c.verdict, evidenceQuote: c.quote, evidenceSourceDoc: c.sourceDoc, evidenceSourceDate: c.sourceDate })
    }
  }

  await seedFillerPatients()
  await seedProvidersAndAppointments()

  await db.insert(identityMatches).values([
    { intakeqClientIdRef: 'enc-iq-pending-01', referralName: 'Linda Cho', referralDob: '1978-06-30', candidateTebraPatientIdRef: 'enc-tb-cand-01', candidateName: 'Linda M. Cho', candidateDob: '1978-06-30', confidence: 72, status: 'pending' },
    { intakeqClientIdRef: 'enc-iq-pending-02', referralName: 'Katherine Voss', referralDob: '1982-12-05', candidateTebraPatientIdRef: 'enc-tb-cand-02', candidateName: 'Kathryn Voss', candidateDob: '1982-12-05', confidence: 88, status: 'pending' },
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
      { id: 'q4', label: 'Currently taking antidepressants?', type: 'select', options: ['Yes', 'No'], hipaaSensitive: true, required: true, compareToChart: { type: 'medication_active', medicationClass: 'SSRI/SNRI antidepressant' } },
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
      { id: 'q3', label: 'Current stimulant medication (if any)', type: 'text', hipaaSensitive: true, required: false, compareToChart: { type: 'medication_active', medicationClass: 'Stimulant' } },
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

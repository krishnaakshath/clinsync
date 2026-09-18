import { pgTable, text, timestamp, date, boolean, jsonb, integer, pgEnum, serial } from 'drizzle-orm/pg-core'

export const verdictEnum = pgEnum('verdict', ['green', 'yellow', 'red'])
export const roleEnum = pgEnum('role', ['crc', 'pi', 'admin'])
export const matchStatusEnum = pgEnum('match_status', ['pending', 'confirmed', 'rejected'])

export const trials = pgTable('trials', {
  id: text('id').primaryKey(),                 // e.g. "nct06911112"
  name: text('name').notNull(),
  nctNumber: text('nct_number').notNull(),
  condition: text('condition').notNull(),        // e.g. "Major Depressive Disorder"
  site: text('site').notNull(),
  studyDrug: text('study_drug').notNull(),
  ageMin: integer('age_min').notNull(),
  ageMax: integer('age_max').notNull(),
  diagnosisCodes: jsonb('diagnosis_codes').$type<{ code: string; description: string }[]>().notNull(),
  ratingScales: jsonb('rating_scales').$type<{ name: string; description: string }[]>().notNull(),
  // Two different medication-rule shapes share this column, distinguished
  // by ruleType: 'washout_exclusion' (must NOT be actively on this class
  // within `washoutDays` -- an exclusion criterion, e.g. ADHD's stimulant
  // washout) vs 'required_stable' (must BE actively on this class for at
  // least `washoutDays` -- an inclusion/stability criterion, e.g. MDD's
  // "on current antidepressant >= 8 weeks"). Treating both the same was a
  // real evaluation bug: someone correctly on a stable antidepressant would
  // otherwise be scored as if they were on an excluded medication.
  medicationClasses: jsonb('medication_classes').$type<
    { className: string; washoutDays: number; rule: string; ruleType: 'washout_exclusion' | 'required_stable' }[]
  >().notNull(),
  // Exclusion criteria: diagnoses that disqualify an otherwise-eligible
  // patient (e.g. active psychosis, current substance use disorder) --
  // distinct from medicationClasses above, which is also an exclusion rule
  // but keyed on active medications rather than diagnoses.
  exclusionDiagnoses: jsonb('exclusion_diagnoses').$type<{ code: string; description: string }[]>().default([]).notNull(),
  // Inclusion criterion: minimum severity on the trial's primary rating
  // scale (ratingScales[0]). Null means this trial doesn't gate on score.
  minRatingScaleScore: integer('min_rating_scale_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const patients = pgTable('patients', {
  id: text('id').primaryKey(),                  // anonymous id "RD-0001"
  dateAdded: timestamp('date_added').defaultNow().notNull(),
  // Pseudonymous cross-system linkage IDs, wrapped with the `ENC[...]`
  // string convention -- NOT ciphertext (see the comment in lib/crypto.ts
  // for why real encryption isn't warranted here). Named `...Ref`, not
  // `...Encrypted`, so the property name doesn't assert a guarantee this
  // column doesn't actually provide.
  intakeqClientIdRef: text('intakeq_client_id_encrypted').notNull(),
  tebraPatientIdRef: text('tebra_patient_id_encrypted'),
  nameIntakeq: text('name_intakeq').notNull(),
  nameTebra: text('name_tebra'),
  dobIntakeq: date('dob_intakeq').notNull(),
  dobTebra: date('dob_tebra'),
  cityIntakeq: text('city_intakeq'),
  cityTebra: text('city_tebra'),
  zipIntakeq: text('zip_intakeq'),
  zipTebra: text('zip_tebra'),
  phoneIntakeq: text('phone_intakeq'),
  phoneTebra: text('phone_tebra'),
  emailIntakeq: text('email_intakeq'),
  emailTebra: text('email_tebra'),
  currentProvider: text('current_provider'),
  ratingScales: jsonb('rating_scales').$type<{ name: string; score: number; date: string }[]>().default([]),
  referralType: text('referral_type'),
  availability: text('availability'),
  lastApptDate: date('last_appt_date'),
  nextApptDate: date('next_appt_date'),
  commConsentSigned: boolean('comm_consent_signed').default(false),
  commConsentPref: text('comm_consent_pref'),
  templateDocUrl: text('template_doc_url'),
  prescreeningSentDate: date('prescreening_sent_date'),
  tebraChartUrl: text('tebra_chart_url'),
  // Staff-owned fields (2, 12, 17-20, 23, 24, 28 in the 30-column map) — never overwritten by refresh
  // Hospital-issued patient portal credential -- distinct from any staff
  // account, scrypt-hashed the same way as lib/password.ts. Null means the
  // patient has no portal access provisioned yet; portal login refuses to
  // even attempt a password check in that case (see api/patient-portal/login),
  // so a patient can only ever reach the portal after staff sets this up
  // for them from inside the app.
  portalPasswordHash: text('portal_password_hash'),
  lastCommunication: text('last_communication'),
  formNotes: text('form_notes'),
  reviewerNotes: text('reviewer_notes'),
  clinicianReviewerNotes: text('clinician_reviewer_notes'),
  piRecommendation: text('pi_recommendation'),
  oldNotes: text('old_notes'),
  oldRecs: text('old_recs'),
  outsideMedsConfirmation: text('outside_meds_confirmation'),
  chartDataAsOf: timestamp('chart_data_as_of').defaultNow().notNull(),
})

export const diagnoses = pgTable('diagnoses', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  code: text('code').notNull(),
  description: text('description').notNull(),
  source: text('source', { enum: ['tebra', 'intakeq'] }).notNull(),
  date: date('date'),
})

export const medicationEpisodes = pgTable('medication_episodes', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  name: text('name').notNull(),
  medicationClass: text('medication_class').notNull(),
  dose: text('dose'),
  startDate: date('start_date').notNull(),
  stopDate: date('stop_date'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull(),
})

export const patientTrialScreenings = pgTable('patient_trial_screenings', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  trialId: text('trial_id').notNull().references(() => trials.id),
  overallStatus: verdictEnum('overall_status').notNull(),
})

export const screeningCriteriaResults = pgTable('screening_criteria_results', {
  id: serial('id').primaryKey(),
  screeningId: integer('screening_id').notNull().references(() => patientTrialScreenings.id),
  criterionKey: text('criterion_key').notNull(),
  criterionText: text('criterion_text').notNull(),
  // Nullable for backward compatibility with rows written before this
  // column existed (see the seed.ts migration note) -- the UI treats a null
  // type the same as 'inclusion'.
  criterionType: text('criterion_type', { enum: ['inclusion', 'exclusion'] }),
  verdict: verdictEnum('verdict').notNull(),
  evidenceQuote: text('evidence_quote'),
  evidenceSourceDoc: text('evidence_source_doc'),
  evidenceSourceDate: date('evidence_source_date'),
})

export const identityMatches = pgTable('identity_matches', {
  id: serial('id').primaryKey(),
  intakeqClientIdRef: text('intakeq_client_id_encrypted').notNull(),
  referralName: text('referral_name').notNull(),
  referralDob: date('referral_dob').notNull(),
  candidateTebraPatientIdRef: text('candidate_tebra_patient_id_encrypted').notNull(),
  candidateName: text('candidate_name').notNull(),
  candidateDob: date('candidate_dob').notNull(),
  confidence: integer('confidence').notNull(), // 0-100
  status: matchStatusEnum('status').default('pending').notNull(),
})

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userName: text('user_name').notNull(),
  role: roleEnum('role'),
  action: text('action').notNull(),
  patientId: text('patient_id'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  details: text('details'),
})

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  // Nullable: the one real admin account still authenticates via
  // ADMIN_EMAIL/ADMIN_PASSWORD_HASH (see api/login/route.ts) rather than a
  // row here. Set for any other user this pilot provisions a real login
  // for (pi/crc demo accounts). Same scrypt scheme as lib/password.ts.
  passwordHash: text('password_hash'),
})

export const formSubmissionStatusEnum = pgEnum('form_submission_status', ['sent', 'partial', 'completed'])
export const idTypeEnum = pgEnum('id_type', ['drivers_license', 'state_id', 'passport'])
export const severityEnum = pgEnum('severity', ['mild', 'moderate', 'severe'])

export const formTemplates = pgTable('form_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),          // folder grouping in the library UI, e.g. "Trial Intake", "Consent Forms", "Screening Questionnaires"
  diagnosisTag: text('diagnosis_tag').notNull(),
  questions: jsonb('questions').$type<{
    id: string
    label: string
    type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox'
    options?: string[]
    hipaaSensitive: boolean
    required: boolean
    autofillField?: 'name' | 'dob' | 'email' | 'phone' | null
  }[]>().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const formSubmissions = pgTable('form_submissions', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => formTemplates.id),
  patientId: text('patient_id').notNull().references(() => patients.id),
  status: formSubmissionStatusEnum('status').default('sent').notNull(),
  sentDate: timestamp('sent_date').defaultNow().notNull(),
  completedDate: timestamp('completed_date'),
  answers: jsonb('answers').$type<Record<string, string>>().default({}),
  accessToken: text('access_token').unique(),
  tokenExpiresAt: timestamp('token_expires_at'),
})

export const allergies = pgTable('allergies', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  allergen: text('allergen').notNull(),
  reaction: text('reaction'),
  severity: severityEnum('severity').notNull(),
})

export const identityVerifications = pgTable('identity_verifications', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id).unique(),
  idType: idTypeEnum('id_type').notNull(),
  idNumberEncrypted: text('id_number_encrypted').notNull(),
  verified: boolean('verified').default(false).notNull(),
  verifiedBy: text('verified_by'),
  verifiedAt: timestamp('verified_at'),
})

// Single-row table: one settings record for the whole pilot deployment.
export const appSettings = pgTable('app_settings', {
  id: serial('id').primaryKey(),
  autoClassifyOnComplete: boolean('auto_classify_on_complete').default(false).notNull(),
  practiceName: text('practice_name'),
  practiceSite: text('practice_site'),
  practiceTimezone: text('practice_timezone').default('America/Los_Angeles'),
  // Credentials for the real Tebra/IntakeQ APIs, stored so an admin can
  // provision them here once the vendor issues real access -- this pilot
  // has a signed BAA but no API access yet, so nothing reads these fields
  // to make an outbound call today. AES-256-GCM encrypted at rest via
  // lib/crypto.ts, same as identityVerifications.idNumberEncrypted; never
  // decrypted for display, only for a future real sync job to consume.
  intakeqApiKeyEncrypted: text('intakeq_api_key_encrypted'),
  tebraCustomerKeyEncrypted: text('tebra_customer_key_encrypted'),
  tebraUserEncrypted: text('tebra_user_encrypted'),
  tebraPasswordEncrypted: text('tebra_password_encrypted'),
})

export const appointmentStatusEnum = pgEnum('appointment_status', ['scheduled', 'completed', 'cancelled', 'no_show'])

// A real, structured provider roster for scheduling. Deliberately NOT
// backfilled from `patients.currentProvider` — see the Design Decision
// section in this phase's plan (docs/superpowers/plans/2026-09-17-phase2-scheduling.md)
// for the reasoning: that free-text field has almost no diversity to backfill
// from and lacks the structured fields (credentials, specialty, calendar
// color) a real scheduling feature needs. `colorTag` is always one of the
// design system's grayscale chart tokens ('chart-1'..'chart-5', defined in
// src/app/globals.css) — enforced at the application layer (see the seed
// roster and PROVIDER_DOT_CLASSNAME map in later tasks), not as a DB enum,
// since it's a display concern rather than a domain invariant.
export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  credentials: text('credentials'),
  specialty: text('specialty').notNull(),
  colorTag: text('color_tag').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  providerId: integer('provider_id').notNull().references(() => providers.id),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  visitReason: text('visit_reason').notNull(),
  status: appointmentStatusEnum('status').default('scheduled').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

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
  medicationClasses: jsonb('medication_classes').$type<
    { className: string; washoutDays: number; rule: string }[]
  >().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const patients = pgTable('patients', {
  id: text('id').primaryKey(),                  // anonymous id "RD-0001"
  dateAdded: timestamp('date_added').defaultNow().notNull(),
  intakeqClientIdEncrypted: text('intakeq_client_id_encrypted').notNull(),
  tebraPatientIdEncrypted: text('tebra_patient_id_encrypted'),
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
  verdict: verdictEnum('verdict').notNull(),
  evidenceQuote: text('evidence_quote'),
  evidenceSourceDoc: text('evidence_source_doc'),
  evidenceSourceDate: date('evidence_source_date'),
})

export const identityMatches = pgTable('identity_matches', {
  id: serial('id').primaryKey(),
  intakeqClientIdEncrypted: text('intakeq_client_id_encrypted').notNull(),
  referralName: text('referral_name').notNull(),
  referralDob: date('referral_dob').notNull(),
  candidateTebraPatientIdEncrypted: text('candidate_tebra_patient_id_encrypted').notNull(),
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
})

export const chargeStatusEnum = pgEnum('charge_status', ['draft', 'pending_approval', 'approved', 'submitted'])
export const insuranceClaimStatusEnum = pgEnum('insurance_claim_status', [
  'rejected', 'denied', 'waiting_adjudication', 'needs_investigation', 'paid',
])
export const statementDeliveryMethodEnum = pgEnum('statement_delivery_method', ['email', 'sms', 'paper'])
export const statementTypeEnum = pgEnum('statement_type', ['initial', 'reminder', 'final_notice'])
export const statementDeliveryStatusEnum = pgEnum('statement_delivery_status', ['delivered', 'failed'])
export const mockPaymentResultEnum = pgEnum('mock_payment_result', ['success', 'failed'])

export const charges = pgTable('charges', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  // Free-text clinician name, matching the existing patients.currentProvider
  // convention -- Phase 2 owns a real `providers` table and hasn't built it
  // yet as of this plan; Phase 3 must not create a dependency on another
  // phase's not-yet-existing schema.
  providerName: text('provider_name').notNull(),
  dateOfService: date('date_of_service').notNull(),
  diagnosisCodes: jsonb('diagnosis_codes').$type<{ code: string; description: string }[]>().notNull(),
  procedureCodes: jsonb('procedure_codes').$type<
    { code: string; description: string; units: number; chargeCents: number }[]
  >().notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: chargeStatusEnum('status').default('draft').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insuranceClaims = pgTable('insurance_claims', {
  id: serial('id').primaryKey(),
  chargeId: integer('charge_id').notNull().references(() => charges.id),
  patientId: text('patient_id').notNull().references(() => patients.id),
  payerName: text('payer_name').notNull(),
  billedAmountCents: integer('billed_amount_cents').notNull(),
  paidAmountCents: integer('paid_amount_cents'),
  status: insuranceClaimStatusEnum('status').notNull(),
  submittedDate: date('submitted_date').notNull(),
  notes: text('notes'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const patientStatements = pgTable('patient_statements', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  amountCents: integer('amount_cents').notNull(),
  deliveryMethod: statementDeliveryMethodEnum('delivery_method').notNull(),
  type: statementTypeEnum('type').notNull(),
  deliveryStatus: statementDeliveryStatusEnum('delivery_status').notNull(),
  sentDate: timestamp('sent_date').defaultNow().notNull(),
})

// SAFETY (see Global Constraints "Mock-payment safety rule"): this table
// stores only the last 4 digits of a card number and never a full PAN or a
// CVC -- there is no column here capable of holding either. `result` is
// decided purely by a fake Luhn-checksum pass/fail, never a real payment
// processor response.
export const mockPayments = pgTable('mock_payments', {
  id: serial('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  chargeId: integer('charge_id').references(() => charges.id),
  amountCents: integer('amount_cents').notNull(),
  cardLast4: text('card_last4').notNull(),
  expMonth: integer('exp_month').notNull(),
  expYear: integer('exp_year').notNull(),
  result: mockPaymentResultEnum('result').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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

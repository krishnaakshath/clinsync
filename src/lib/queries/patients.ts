import { getDb } from '@/db/client'
import {
  patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes, allergies, identityVerifications,
  formSubmissions, formChartDiscrepancies, reviews, appointments, messages, charges, insuranceClaims, patientStatements, mockPayments, documents, faxes,
  rooms, doctorAssignments, insuranceEligibilityChecks, admissions, admissionTransfers, encounterNotes, medicationAdministrations,
  medicationDispenses, carePlans, carePlanGoals, labOrders, labResults,
} from '@/db/schema'
import { eq, inArray, or } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, patientListCacheKey, patientDetailCacheKey, dashboardCacheKey, workbookListCacheKey } from '@/lib/cache'
import { listDiscrepanciesForPatient } from '@/lib/queries/discrepancies'
import type { Verdict } from '@/lib/rule-engine'

export interface CriteriaSummary {
  inclusionMet: number
  inclusionTotal: number
  exclusionMet: number
  exclusionTotal: number
}

// `mfaSecretEncrypted` is the patient's encrypted TOTP secret -- only the
// portal login/enrollment routes ever need it, and they read it through
// getPatientMfaState, never through these list/detail queries. Both queries
// below are serialized to JSON (GET /api/patients, GET /api/patients/[anonId],
// Server Component props) and written to the Redis cache, so the column is
// stripped from every row they return rather than riding along in a
// whole-row spread. `mfaEnabled` (a non-sensitive flag the staff UI shows)
// stays.
type PatientRowWithoutMfaSecret = Omit<typeof patients.$inferSelect, 'mfaSecretEncrypted'>

function withoutMfaSecret(row: typeof patients.$inferSelect): PatientRowWithoutMfaSecret {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mfaSecretEncrypted, ...rest } = row
  return rest
}

export type PatientWithStatus = PatientRowWithoutMfaSecret & { trialId?: string; overallStatus?: Verdict; criteriaSummary?: CriteriaSummary }

/**
 * Shared by the /api/patients route handler and any Server Component that
 * needs this data. Server Components must call this directly rather than
 * `fetch()`-ing the app's own API route — a prior review found that pattern
 * (deriving the outbound fetch's origin from the incoming, client-controlled
 * Host header) let an attacker exfiltrate a live session cookie via a forged
 * Host header. Calling the query directly needs no outbound HTTP request at
 * all, which removes that vulnerability class entirely (and matches Next.js's
 * own guidance: fetch data in Server Components from its source, not via
 * Route Handlers).
 */
export async function listPatientsWithStatus(trialId: string | null): Promise<PatientWithStatus[]> {
  return getOrSetCache(patientListCacheKey(trialId), 30, async () => {
    const rows = await getDb()
      .select({ patient: patients, screening: patientTrialScreenings })
      .from(patients)
      .leftJoin(patientTrialScreenings, eq(patientTrialScreenings.patientId, patients.id))
      .where(trialId ? eq(patientTrialScreenings.trialId, trialId) : undefined)
      .orderBy(patients.id)

    // Single grouped query for every screening's criteria results, joined
    // back to patientId, so the patient list/cards can show a lightweight
    // "N/M inclusion" readout without an N+1 per-patient criteria lookup.
    const criteriaRows = await getDb()
      .select({
        patientId: patientTrialScreenings.patientId,
        criterionType: screeningCriteriaResults.criterionType,
        verdict: screeningCriteriaResults.verdict,
      })
      .from(screeningCriteriaResults)
      .innerJoin(patientTrialScreenings, eq(screeningCriteriaResults.screeningId, patientTrialScreenings.id))

    const summaryByPatient = new Map<string, CriteriaSummary>()
    for (const row of criteriaRows) {
      const summary = summaryByPatient.get(row.patientId) ?? { inclusionMet: 0, inclusionTotal: 0, exclusionMet: 0, exclusionTotal: 0 }
      const met = row.verdict === 'green'
      // Null criterionType is legacy data written before the column existed
      // -- the UI (and this rollup) treats it the same as 'inclusion'.
      if (row.criterionType === 'exclusion') {
        summary.exclusionTotal += 1
        if (met) summary.exclusionMet += 1
      } else {
        summary.inclusionTotal += 1
        if (met) summary.inclusionMet += 1
      }
      summaryByPatient.set(row.patientId, summary)
    }

    return rows.map((r) => ({
      ...withoutMfaSecret(r.patient),
      trialId: r.screening?.trialId,
      overallStatus: r.screening?.overallStatus,
      criteriaSummary: summaryByPatient.get(r.patient.id),
    }))
  })
}

/**
 * Shared by the /api/patients/[anonId] route handler and the Patient Detail
 * Server Component page — see the comment on `listPatientsWithStatus` above
 * for why Server Components must call this directly rather than fetching
 * the app's own API route.
 */
export async function getPatientDetail(anonId: string) {
  return getOrSetCache(patientDetailCacheKey(anonId), 30, async () => {
    const [patient] = await getDb().select().from(patients).where(eq(patients.id, anonId))
    if (!patient) return null

    const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
    const criteria = screening ? await getDb().select().from(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screening.id)) : []
    const dx = await getDb().select().from(diagnoses).where(eq(diagnoses.patientId, anonId))
    const meds = await getDb().select().from(medicationEpisodes).where(eq(medicationEpisodes.patientId, anonId))
    const patientAllergies = await getDb().select().from(allergies).where(eq(allergies.patientId, anonId))
    // Project down to only what callers need. The full row includes
    // `idNumberEncrypted` (encrypted ciphertext of the ID number) and the
    // internal `id`/`patientId` keys -- never decrypted here, but there's no
    // reason to put ciphertext on the wire, in the Redis cache, or into the
    // Excel-export code path's intermediate objects when it's unused.
    const [identity] = await getDb()
      .select({
        idType: identityVerifications.idType,
        verified: identityVerifications.verified,
        verifiedBy: identityVerifications.verifiedBy,
        verifiedAt: identityVerifications.verifiedAt,
      })
      .from(identityVerifications)
      .where(eq(identityVerifications.patientId, anonId))

    const discrepancies = await listDiscrepanciesForPatient(anonId)

    return { ...withoutMfaSecret(patient), mfaEnabled: patient.mfaEnabled, overallStatus: screening?.overallStatus, criteria, diagnoses: dx, medications: meds, allergies: patientAllergies, identityVerification: identity ?? null, portalConfigured: !!patient.portalPasswordHash, discrepancies }
  })
}

/**
 * Permanently removes a patient and every row that references it -- for
 * correcting a real mistake (a duplicate chart, a wrong entry), not a
 * routine action. None of these FKs cascade at the DB level (see
 * db/seed.ts's clearExistingData, which deletes in this same
 * children-before-parents order for the same reason), so each table is
 * cleared explicitly; Postgres would otherwise reject the final delete on
 * `patients` with a foreign-key violation. Returns false if the patient
 * doesn't exist, true once every row is gone.
 */
export async function deletePatient(anonId: string): Promise<boolean> {
  const db = getDb()
  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, anonId))
  if (!patient) return false

  const screenings = await db.select({ id: patientTrialScreenings.id, trialId: patientTrialScreenings.trialId }).from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  const screeningIds = screenings.map((s) => s.id)
  if (screeningIds.length > 0) {
    await db.delete(screeningCriteriaResults).where(inArray(screeningCriteriaResults.screeningId, screeningIds))
  }

  // Looked up here, ahead of the admissions delete further down, because
  // medicationAdministrations must be cleared before medicationEpisodes --
  // medicationAdministrations.medicationEpisodeId is a nullable FK to
  // medicationEpisodes(id) with no ON DELETE action, so Postgres would
  // reject the medicationEpisodes delete below once an administration
  // references an episode (same FK-ordering discipline as the
  // doctorAssignments/appointments note further down).
  const patientAdmissionIds = (await db.select({ id: admissions.id }).from(admissions).where(eq(admissions.patientId, anonId))).map((a) => a.id)
  if (patientAdmissionIds.length > 0) {
    await db.delete(medicationAdministrations).where(inArray(medicationAdministrations.admissionId, patientAdmissionIds))
  }

  await db.delete(formChartDiscrepancies).where(eq(formChartDiscrepancies.patientId, anonId))
  await db.delete(reviews).where(eq(reviews.patientId, anonId))
  await db.delete(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, anonId))
  // medicationDispenses.medicationEpisodeId is a nullable FK to
  // medicationEpisodes(id) with no ON DELETE action -- same ordering hazard
  // as medicationAdministrations above, so dispenses referencing an episode
  // must be cleared before medicationEpisodes itself. (Final whole-branch
  // review of feature/care-plans: medicationDispenses had a direct
  // patient_id FK to patients with no ON DELETE action and was missing from
  // this cascade entirely -- confirmed the third instance of this exact bug
  // class in this function, alongside care_plans below.)
  await db.delete(medicationDispenses).where(eq(medicationDispenses.patientId, anonId))
  await db.delete(medicationEpisodes).where(eq(medicationEpisodes.patientId, anonId))
  await db.delete(diagnoses).where(eq(diagnoses.patientId, anonId))
  await db.delete(formSubmissions).where(eq(formSubmissions.patientId, anonId))
  await db.delete(allergies).where(eq(allergies.patientId, anonId))
  await db.delete(identityVerifications).where(eq(identityVerifications.patientId, anonId))
  // doctorAssignments must be deleted before appointments -- doctorAssignments.appointmentId
  // is a nullable FK to appointments(id) with no ON DELETE action, so Postgres would reject
  // the appointments delete below with a foreign-key violation once a doctor assignment
  // references an appointment (see the children-before-parents ordering already used above
  // for screeningCriteriaResults before patientTrialScreenings).
  //
  // admissionTransfers -> admissions -> doctorAssignments -> appointments, in that order:
  // admissionTransfers.admissionId references admissions(id), and admissions itself
  // references both doctorAssignments(id) (createdFromAssignmentId) and appointments(id)
  // (followUpAppointmentId) -- the same FK-ordering discipline applied one level deeper.
  await db.delete(insuranceEligibilityChecks).where(eq(insuranceEligibilityChecks.patientId, anonId))
  await db.delete(encounterNotes).where(eq(encounterNotes.patientId, anonId))
  // documents.admission_id is a nullable FK to admissions(id) with no ON
  // DELETE action -- the same ordering hazard already documented above for
  // medicationAdministrations and doctorAssignments. Documents filed to this
  // patient go first; the update then catches the pathological case of a
  // document filed to someone else (or Unfiled) that still references one of
  // this patient's admissions, which the DB permits even though the routes
  // never create it.
  await db.delete(documents).where(eq(documents.patientId, anonId))
  if (patientAdmissionIds.length > 0) {
    await db.update(documents).set({ admissionId: null }).where(inArray(documents.admissionId, patientAdmissionIds))
  }
  if (patientAdmissionIds.length > 0) {
    await db.delete(admissionTransfers).where(inArray(admissionTransfers.admissionId, patientAdmissionIds))
  }
  await db.delete(admissions).where(eq(admissions.patientId, anonId))
  await db.delete(doctorAssignments).where(eq(doctorAssignments.patientId, anonId))
  await db.delete(appointments).where(eq(appointments.patientId, anonId))
  await db.delete(messages).where(eq(messages.patientId, anonId))
  await db.delete(insuranceClaims).where(eq(insuranceClaims.patientId, anonId))
  await db.delete(mockPayments).where(eq(mockPayments.patientId, anonId))
  await db.delete(patientStatements).where(eq(patientStatements.patientId, anonId))
  await db.delete(charges).where(eq(charges.patientId, anonId))
  await db.delete(faxes).where(eq(faxes.patientId, anonId))
  await db.update(rooms).set({ status: 'available', occupiedByPatientId: null }).where(eq(rooms.occupiedByPatientId, anonId))

  // care_plans.patient_id is a NOT NULL FK to patients(id) with no ON DELETE
  // action (Task 1 of feature/care-plans). This cascade was never updated
  // for it -- deleting a patient with a care plan deleted their whole chart
  // and then failed on the final `DELETE FROM patients` below with a
  // foreign-key violation, leaving a half-deleted patient with orphaned
  // care_plans/care_plan_goals rows. Children (goals) before parent (plans),
  // scoped to this patient, same discipline as the rest of this function.
  const carePlanIds = (await db.select({ id: carePlans.id }).from(carePlans).where(eq(carePlans.patientId, anonId))).map((p) => p.id)
  if (carePlanIds.length > 0) {
    await db.delete(carePlanGoals).where(inArray(carePlanGoals.carePlanId, carePlanIds))
  }
  await db.delete(carePlans).where(eq(carePlans.patientId, anonId))

  // lab_orders.patient_id is a NOT NULL FK to patients(id) with no ON DELETE
  // action, same gap as care_plans/medicationDispenses above. Children
  // (results) before parent (orders), scoped to this patient.
  const labOrderIds = (await db.select({ id: labOrders.id }).from(labOrders).where(eq(labOrders.patientId, anonId))).map((o) => o.id)
  if (labOrderIds.length > 0) {
    await db.delete(labResults).where(inArray(labResults.labOrderId, labOrderIds))
  }
  await db.delete(labOrders).where(eq(labOrders.patientId, anonId))

  await db.delete(patients).where(eq(patients.id, anonId))

  await invalidateCache(patientDetailCacheKey(anonId))
  await invalidateCache(patientListCacheKey(null))
  await invalidateCache(dashboardCacheKey())
  await invalidateCache(workbookListCacheKey())
  for (const s of screenings) {
    await invalidateCache(patientListCacheKey(s.trialId))
  }

  return true
}

export interface LikelyDuplicatePatient {
  id: string
  name: string
  dob: string
}

export async function findLikelyDuplicatePatients(name: string, dob: string): Promise<LikelyDuplicatePatient[]> {
  const rows = await getDb()
    .select({ id: patients.id, nameTebra: patients.nameTebra, nameIntakeq: patients.nameIntakeq, dobTebra: patients.dobTebra, dobIntakeq: patients.dobIntakeq })
    .from(patients)
    .where(or(eq(patients.dobIntakeq, dob), eq(patients.dobTebra, dob)))

  const needle = name.trim().toLowerCase()
  return rows
    .filter((r) => (r.nameTebra ?? r.nameIntakeq).toLowerCase().includes(needle) || needle.includes((r.nameTebra ?? r.nameIntakeq).toLowerCase()))
    .map((r) => ({ id: r.id, name: r.nameTebra ?? r.nameIntakeq, dob: (r.dobTebra ?? r.dobIntakeq) as string }))
}

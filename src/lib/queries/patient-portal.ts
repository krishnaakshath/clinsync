import { getDb } from '@/db/client'
import { patients, diagnoses, medicationEpisodes, appointments, providers, formSubmissions, formTemplates } from '@/db/schema'
import { eq, desc, asc, gte, lt, and } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '@/lib/password'

/**
 * Everything a patient is allowed to see about themselves through the
 * portal -- deliberately excludes clinician notes (formNotes,
 * reviewerNotes, clinicianReviewerNotes, piRecommendation, oldNotes,
 * oldRecs), both encrypted-ID ref columns, and internal trial-eligibility
 * screening verdicts. This is patient-facing PHI display, not staff chart
 * review, and none of those fields are appropriate to show a patient about
 * their own record.
 */
export async function getPatientPortalData(patientId: string) {
  const [patient] = await getDb().select().from(patients).where(eq(patients.id, patientId))
  if (!patient) return null

  const dx = await getDb().select({ code: diagnoses.code, description: diagnoses.description, date: diagnoses.date }).from(diagnoses).where(eq(diagnoses.patientId, patientId))
  const meds = await getDb()
    .select({ id: medicationEpisodes.id, name: medicationEpisodes.name, medicationClass: medicationEpisodes.medicationClass, dose: medicationEpisodes.dose, startDate: medicationEpisodes.startDate, stopDate: medicationEpisodes.stopDate, status: medicationEpisodes.status })
    .from(medicationEpisodes)
    .where(eq(medicationEpisodes.patientId, patientId))

  const now = new Date()
  const upcoming = await getDb()
    .select({ id: appointments.id, startsAt: appointments.startsAt, visitReason: appointments.visitReason, status: appointments.status, providerName: providers.name })
    .from(appointments)
    .innerJoin(providers, eq(appointments.providerId, providers.id))
    .where(and(eq(appointments.patientId, patientId), gte(appointments.startsAt, now)))
    .orderBy(asc(appointments.startsAt))

  const past = await getDb()
    .select({ id: appointments.id, startsAt: appointments.startsAt, visitReason: appointments.visitReason, status: appointments.status, providerName: providers.name })
    .from(appointments)
    .innerJoin(providers, eq(appointments.providerId, providers.id))
    .where(and(eq(appointments.patientId, patientId), lt(appointments.startsAt, now)))
    .orderBy(desc(appointments.startsAt))
    .limit(10)

  // Forms sent to this patient were previously only reachable through a
  // separate, out-of-band token link (e.g. texted/emailed by staff) --
  // never surfaced anywhere inside the portal itself, so a patient who
  // lost or never received that link had no way to find or fill a form
  // they'd been sent. Surface every submission by access token instead.
  const forms = await getDb()
    .select({ id: formSubmissions.id, status: formSubmissions.status, sentDate: formSubmissions.sentDate, accessToken: formSubmissions.accessToken, templateName: formTemplates.name })
    .from(formSubmissions)
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .where(eq(formSubmissions.patientId, patientId))
    .orderBy(desc(formSubmissions.sentDate))

  return {
    id: patient.id,
    name: patient.nameTebra ?? patient.nameIntakeq,
    dob: patient.dobTebra ?? patient.dobIntakeq,
    currentProvider: patient.currentProvider,
    portalConfigured: !!patient.portalPasswordHash,
    diagnoses: dx,
    activeMedications: meds.filter((m) => m.status === 'active'),
    pastMedications: meds.filter((m) => m.status === 'inactive'),
    upcomingAppointments: upcoming,
    pastAppointments: past,
    forms,
  }
}

export async function verifyPatientPortalCredentials(patientId: string, password: string): Promise<boolean> {
  const [patient] = await getDb().select({ portalPasswordHash: patients.portalPasswordHash }).from(patients).where(eq(patients.id, patientId))
  if (!patient?.portalPasswordHash) return false
  return verifyPassword(password, patient.portalPasswordHash)
}

export async function setPatientPortalPassword(patientId: string, plaintextPassword: string): Promise<void> {
  await getDb().update(patients).set({ portalPasswordHash: hashPassword(plaintextPassword) }).where(eq(patients.id, patientId))
}

export async function revokePatientPortalAccess(patientId: string): Promise<void> {
  await getDb().update(patients).set({ portalPasswordHash: null }).where(eq(patients.id, patientId))
}

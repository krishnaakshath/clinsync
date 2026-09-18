import { getDb } from '@/db/client'
import { trials, patients, diagnoses, medicationEpisodes, screeningCriteriaResults, patientTrialScreenings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { evaluateEligibility } from '@/lib/eligibility'
import { evaluateCriteria, type Verdict } from '@/lib/rule-engine'

/**
 * The single place a screening's criteria rows get (re)computed from live
 * chart data, shared by the manual "Run Classification" action and
 * auto-classify-on-complete so there's exactly one evaluation path, not two
 * that could silently diverge. Replaces whatever criteria rows already
 * existed for this screening with a fresh set -- including for the six
 * hand-seeded demo patients, whose illustrative seed criteria get replaced
 * by real evaluated ones the first time anyone clicks Refresh/Run
 * Classification on them.
 */
export async function regenerateScreeningCriteria(patientId: string, screeningId: number, trialId: string): Promise<Verdict | null> {
  const db = getDb()
  const [trial] = await db.select().from(trials).where(eq(trials.id, trialId))
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId))
  if (!trial || !patient) return null

  const dx = await db.select({ code: diagnoses.code, description: diagnoses.description }).from(diagnoses).where(eq(diagnoses.patientId, patientId))
  const meds = await db
    .select({ name: medicationEpisodes.name, medicationClass: medicationEpisodes.medicationClass, startDate: medicationEpisodes.startDate, status: medicationEpisodes.status })
    .from(medicationEpisodes)
    .where(eq(medicationEpisodes.patientId, patientId))

  const dob = patient.dobTebra ?? patient.dobIntakeq
  const results = evaluateEligibility(
    {
      ageMin: trial.ageMin,
      ageMax: trial.ageMax,
      diagnosisCodes: trial.diagnosisCodes,
      ratingScales: trial.ratingScales,
      medicationClasses: trial.medicationClasses,
      exclusionDiagnoses: trial.exclusionDiagnoses,
      minRatingScaleScore: trial.minRatingScaleScore,
    },
    { dob, diagnoses: dx, medications: meds, ratingScales: patient.ratingScales ?? [] }
  )

  await db.delete(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screeningId))
  if (results.length > 0) {
    await db.insert(screeningCriteriaResults).values(results.map((r) => ({ screeningId, ...r })))
  }

  const overallStatus = evaluateCriteria(results)
  await db.update(patientTrialScreenings).set({ overallStatus }).where(eq(patientTrialScreenings.id, screeningId))
  return overallStatus
}

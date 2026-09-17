import { getDb } from '@/db/client'
import { patients, patientTrialScreenings, screeningCriteriaResults, diagnoses, medicationEpisodes } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { evaluateCriteria } from '@/lib/rule-engine'
import { getAppSettings } from '@/lib/queries/settings'
import { invalidateCache, patientDetailCacheKey, patientListCacheKey } from '@/lib/cache'

// Called after a form submission is marked 'completed'. If the
// autoClassifyOnComplete setting is on, and this patient now has both
// completed intake data and at least some chart data (a diagnosis or a
// medication on file), re-runs the same rule-engine evaluation the manual
// "Run Classification" action uses — never a separate, divergent scoring
// path. If the setting is off, or the patient has no screening row yet
// (nothing to re-evaluate against), this is a no-op.
export async function maybeAutoClassify(patientId: string): Promise<void> {
  const settings = await getAppSettings()
  if (!settings.autoClassifyOnComplete) return

  const dx = await getDb().select().from(diagnoses).where(eq(diagnoses.patientId, patientId))
  const meds = await getDb().select().from(medicationEpisodes).where(eq(medicationEpisodes.patientId, patientId))
  if (dx.length === 0 && meds.length === 0) return  // no chart data yet — nothing to classify against

  const [screening] = await getDb().select().from(patientTrialScreenings).where(eq(patientTrialScreenings.patientId, patientId))
  if (!screening) return  // no trial screening exists yet for this patient — manual assignment to a trial happens first

  const criteria = await getDb().select().from(screeningCriteriaResults).where(eq(screeningCriteriaResults.screeningId, screening.id))
  const overallStatus = evaluateCriteria(criteria)
  await getDb().update(patientTrialScreenings).set({ overallStatus }).where(eq(patientTrialScreenings.id, screening.id))
  await getDb().update(patients).set({ chartDataAsOf: new Date() }).where(eq(patients.id, patientId))

  await invalidateCache(patientDetailCacheKey(patientId))
  await invalidateCache(patientListCacheKey(screening.trialId))
  await invalidateCache(patientListCacheKey(null))
}

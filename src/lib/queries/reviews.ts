import { getDb } from '@/db/client'
import { reviews, patients, formSubmissions, formTemplates } from '@/db/schema'
import { eq, desc, asc, and, gte, lte, SQL } from 'drizzle-orm'
import { getOrSetCache, invalidateCache, reviewsListCacheKey } from '@/lib/cache'

export interface ReviewFilters {
  status?: 'sent' | 'completed'
  dateFrom?: string
  dateTo?: string
  sortBy?: 'sentAt' | 'ratingOverall'
  sortDir?: 'asc' | 'desc'
}

export async function listReviews(filters: ReviewFilters) {
  return getOrSetCache(reviewsListCacheKey(JSON.stringify(filters)), 30, async () => {
    const conditions: SQL[] = []
    if (filters.status) conditions.push(eq(reviews.status, filters.status))
    if (filters.dateFrom) conditions.push(gte(reviews.sentAt, new Date(filters.dateFrom)))
    if (filters.dateTo) conditions.push(lte(reviews.sentAt, new Date(filters.dateTo)))

    const sortColumn = filters.sortBy === 'ratingOverall' ? reviews.ratingOverall : reviews.sentAt
    const sortFn = filters.sortDir === 'asc' ? asc : desc

    const rows = await getDb()
      .select({ review: reviews, patient: patients, submission: formSubmissions, template: formTemplates })
      .from(reviews)
      .innerJoin(patients, eq(reviews.patientId, patients.id))
      .innerJoin(formSubmissions, eq(reviews.formSubmissionId, formSubmissions.id))
      .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sortFn(sortColumn))

    return rows.map((r) => ({
      ...r.review,
      patientName: r.patient.nameTebra ?? r.patient.nameIntakeq,
      templateName: r.template.name,
      diagnosisTag: r.template.diagnosisTag,
    }))
  })
}

export async function getReview(id: number) {
  const [row] = await getDb()
    .select({ review: reviews, patient: patients, submission: formSubmissions, template: formTemplates })
    .from(reviews)
    .innerJoin(patients, eq(reviews.patientId, patients.id))
    .innerJoin(formSubmissions, eq(reviews.formSubmissionId, formSubmissions.id))
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .where(eq(reviews.id, id))
  if (!row) return null
  return {
    ...row.review,
    patientName: row.patient.nameTebra ?? row.patient.nameIntakeq,
    templateName: row.template.name,
    diagnosisTag: row.template.diagnosisTag,
  }
}

/**
 * Completed intake submissions that don't already have a survey sent — the
 * candidate list for the "Send Survey" action.
 */
export async function listSurveyableSubmissions() {
  const db = getDb()
  const completed = await db
    .select({ submission: formSubmissions, patient: patients, template: formTemplates })
    .from(formSubmissions)
    .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .where(eq(formSubmissions.status, 'completed'))

  const alreadySurveyed = new Set((await db.select({ formSubmissionId: reviews.formSubmissionId }).from(reviews)).map((r) => r.formSubmissionId))

  return completed
    .filter((r) => !alreadySurveyed.has(r.submission.id))
    .map((r) => ({
      formSubmissionId: r.submission.id,
      patientId: r.patient.id,
      patientName: r.patient.nameTebra ?? r.patient.nameIntakeq,
      templateName: r.template.name,
      completedDate: r.submission.completedDate,
    }))
}

export async function getAverageExperienceRating(): Promise<number | null> {
  const completed = await getDb().select({ ratingOverall: reviews.ratingOverall }).from(reviews).where(eq(reviews.status, 'completed'))
  const ratings = completed.map((r) => r.ratingOverall).filter((r): r is number => r !== null)
  if (ratings.length === 0) return null
  return ratings.reduce((a, b) => a + b, 0) / ratings.length
}

export async function invalidateReviewsList() {
  // Filtered list cache keys are parameterized per filter combination with a
  // short 30s TTL, so a full key-space scan isn't needed — just drop the
  // common no-filter view most screens load by default.
  await invalidateCache(reviewsListCacheKey(JSON.stringify({})))
}

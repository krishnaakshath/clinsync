import { getDb } from '@/db/client'
import { formSubmissions, formTemplates, patients } from '@/db/schema'
import { eq, and, gte, lte, SQL } from 'drizzle-orm'

export interface FormSubmissionFilters {
  diagnosisTag?: string
  status?: 'sent' | 'partial' | 'completed'
  dateFrom?: string
  dateTo?: string
}

export async function listFormSubmissions(filters: FormSubmissionFilters) {
  const conditions: SQL[] = []
  if (filters.status) conditions.push(eq(formSubmissions.status, filters.status))
  if (filters.dateFrom) conditions.push(gte(formSubmissions.sentDate, new Date(filters.dateFrom)))
  if (filters.dateTo) conditions.push(lte(formSubmissions.sentDate, new Date(filters.dateTo)))
  if (filters.diagnosisTag) conditions.push(eq(formTemplates.diagnosisTag, filters.diagnosisTag))

  const rows = await getDb()
    .select({ submission: formSubmissions, template: formTemplates, patient: patients })
    .from(formSubmissions)
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
    .where(conditions.length ? and(...conditions) : undefined)

  return rows.map((r) => ({
    ...r.submission,
    templateName: r.template.name,
    diagnosisTag: r.template.diagnosisTag,
    patientName: r.patient.nameTebra ?? r.patient.nameIntakeq,
  }))
}

export async function getFormSubmission(id: number) {
  const [row] = await getDb()
    .select({ submission: formSubmissions, template: formTemplates, patient: patients })
    .from(formSubmissions)
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
    .where(eq(formSubmissions.id, id))
  if (!row) return null
  return { ...row.submission, templateName: row.template.name, questions: row.template.questions, patientName: row.patient.nameTebra ?? row.patient.nameIntakeq }
}

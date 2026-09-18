import { getDb } from '@/db/client'
import { formSubmissions, formTemplates, patients } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type IntakePortalState = 'active' | 'expired' | 'completed' | 'not_found'

export interface IntakePortalData {
  state: IntakePortalState
  templateName?: string
  questions?: { id: string; label: string; type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox'; options?: string[]; required: boolean }[]
  existingAnswers?: Record<string, string>
  autofill?: Record<string, string>
}

const AUTOFILL_SOURCE = {
  name: (p: typeof patients.$inferSelect) => p.nameIntakeq,
  dob: (p: typeof patients.$inferSelect) => p.dobIntakeq,
  email: (p: typeof patients.$inferSelect) => p.emailIntakeq ?? '',
  phone: (p: typeof patients.$inferSelect) => p.phoneIntakeq ?? '',
} as const

// Deliberately returns only what a specific form's own questions need --
// never diagnoses, medications, allergies, screening verdicts, or any other
// patient field. The token scopes access to exactly this one submission.
export async function getIntakePortalData(token: string): Promise<IntakePortalData> {
  const [row] = await getDb()
    .select({ submission: formSubmissions, template: formTemplates, patient: patients })
    .from(formSubmissions)
    .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
    .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
    .where(eq(formSubmissions.accessToken, token))

  if (!row) return { state: 'not_found' }
  if (row.submission.status === 'completed') return { state: 'completed' }
  if (row.submission.tokenExpiresAt && row.submission.tokenExpiresAt < new Date()) return { state: 'expired' }

  const autofill: Record<string, string> = {}
  for (const q of row.template.questions) {
    if (q.autofillField) autofill[q.id] = AUTOFILL_SOURCE[q.autofillField](row.patient)
  }

  return {
    state: 'active',
    templateName: row.template.name,
    questions: row.template.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options, required: q.required })),
    existingAnswers: row.submission.answers ?? {},
    autofill,
  }
}

export async function getSubmissionPatientIdByToken(token: string): Promise<string | null> {
  const [row] = await getDb().select({ patientId: formSubmissions.patientId, status: formSubmissions.status, tokenExpiresAt: formSubmissions.tokenExpiresAt }).from(formSubmissions).where(eq(formSubmissions.accessToken, token))
  if (!row || row.status === 'completed' || (row.tokenExpiresAt && row.tokenExpiresAt < new Date())) return null
  return row.patientId
}

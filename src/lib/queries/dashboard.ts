import { getDb } from '@/db/client'
import { formSubmissions, formTemplates, patients, patientTrialScreenings, auditLog } from '@/db/schema'
import { eq, desc, isNull, or, inArray } from 'drizzle-orm'
import { getOrSetCache, dashboardCacheKey } from '@/lib/cache'

const ACCOUNT_EVENT_ACTIONS = ['sent intake form', 'completed intake form', 'verified identity', 'ran classification']

export async function getDashboardData() {
  return getOrSetCache(dashboardCacheKey(), 15, async () => {
    const db = getDb()

    const latestForms = await db
      .select({ submission: formSubmissions, template: formTemplates, patient: patients })
      .from(formSubmissions)
      .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
      .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
      .where(eq(formSubmissions.status, 'completed'))
      .orderBy(desc(formSubmissions.completedDate))
      .limit(5)

    const pendingForms = await db
      .select({ submission: formSubmissions, template: formTemplates, patient: patients })
      .from(formSubmissions)
      .innerJoin(formTemplates, eq(formSubmissions.templateId, formTemplates.id))
      .innerJoin(patients, eq(formSubmissions.patientId, patients.id))
      .where(or(eq(formSubmissions.status, 'sent'), eq(formSubmissions.status, 'partial')))
      .orderBy(desc(formSubmissions.sentDate))
      .limit(5)

    // Patients with completed intake + at least one recorded diagnosis/medication,
    // but no screening row yet — the "ready but not yet classified" queue.
    const allPatients = await db.select().from(patients)
    const screenedIds = new Set((await db.select({ id: patientTrialScreenings.patientId }).from(patientTrialScreenings)).map((r) => r.id))
    const completedIntakeIds = new Set((await db.select({ id: formSubmissions.patientId }).from(formSubmissions).where(eq(formSubmissions.status, 'completed'))).map((r) => r.id))
    const pendingClassification = allPatients.filter((p) => completedIntakeIds.has(p.id) && !screenedIds.has(p.id))

    const recentEvents = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.action, ACCOUNT_EVENT_ACTIONS))
      .orderBy(desc(auditLog.timestamp))
      .limit(10)

    return {
      latestForms: latestForms.map((r) => ({ ...r.submission, templateName: r.template.name, patientName: r.patient.nameTebra ?? r.patient.nameIntakeq })),
      pendingForms: pendingForms.map((r) => ({ ...r.submission, templateName: r.template.name, patientName: r.patient.nameTebra ?? r.patient.nameIntakeq })),
      pendingClassification,
      recentEvents,
    }
  })
}

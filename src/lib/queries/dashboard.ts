import { getDb } from '@/db/client'
import { formSubmissions, formTemplates, patients, patientTrialScreenings, auditLog } from '@/db/schema'
import { eq, desc, isNull, or, inArray, sql } from 'drizzle-orm'
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

    const [{ count: pendingFormsTotal }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(or(eq(formSubmissions.status, 'sent'), eq(formSubmissions.status, 'partial')))

    // Patients with completed intake + at least one recorded diagnosis/medication,
    // but no screening row yet — the "ready but not yet classified" queue.
    // Only id/name are ever rendered from this list, so select only those --
    // no reason to cache clinician notes or the encrypted-ID columns here.
    const allPatients = await db.select({ id: patients.id, nameTebra: patients.nameTebra, nameIntakeq: patients.nameIntakeq }).from(patients)
    const screenedIds = new Set((await db.select({ id: patientTrialScreenings.patientId }).from(patientTrialScreenings)).map((r) => r.id))
    const completedIntakeIds = new Set((await db.select({ id: formSubmissions.patientId }).from(formSubmissions).where(eq(formSubmissions.status, 'completed'))).map((r) => r.id))
    const pendingClassification = allPatients.filter((p) => completedIntakeIds.has(p.id) && !screenedIds.has(p.id))

    const recentEvents = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.action, ACCOUNT_EVENT_ACTIONS))
      .orderBy(desc(auditLog.timestamp))
      .limit(10)

    // Project the submission down explicitly rather than spreading the full
    // row -- `accessToken` is a 30-day unauthenticated bearer credential for
    // the intake portal, and this dashboard summary never needs it (it also
    // sits in the plaintext Upstash cache, so less PHI/credentials in here
    // is a real reduction in blast radius, not just an unused field).
    const projectForm = (r: { submission: typeof formSubmissions.$inferSelect; template: { name: string }; patient: { nameTebra: string | null; nameIntakeq: string } }) => ({
      id: r.submission.id,
      status: r.submission.status,
      sentDate: r.submission.sentDate,
      completedDate: r.submission.completedDate,
      templateName: r.template.name,
      patientName: r.patient.nameTebra ?? r.patient.nameIntakeq,
    })

    return {
      latestForms: latestForms.map(projectForm),
      pendingForms: pendingForms.map(projectForm),
      pendingFormsTotal,
      pendingClassification,
      recentEvents,
    }
  })
}

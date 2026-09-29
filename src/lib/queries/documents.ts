import { getDb } from '@/db/client'
import { documents, patients, admissions, documentTypeEnum } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { getOrSetCache, documentsListCacheKey } from '@/lib/cache'

export type DocumentRow = typeof documents.$inferSelect
export type DocumentType = (typeof documentTypeEnum.enumValues)[number]

export interface CreateDocumentInput {
  name: string
  documentDate: string
  receivedFrom: string
  documentType: DocumentType
  patientId: string | null
  admissionId: number | null
  fileUrl: string | null
  fileType: string
  filedByName: string | null
  filedAt: Date | null
}

export async function listDocuments() {
  return getOrSetCache(documentsListCacheKey(), 15, async () => {
    const rows = await getDb()
      .select({ document: documents, patient: patients })
      .from(documents)
      .leftJoin(patients, eq(documents.patientId, patients.id))
      // No ORDER BY here previously meant Postgres could return rows in any
      // order it liked, and that order wasn't even guaranteed to stay put
      // across requests -- an UPDATE (e.g. "Mark Processed") can physically
      // relocate a row's tuple, so the row a coordinator just acted on could
      // silently jump elsewhere in the list on the next render, looking like
      // the click "did nothing" to the row they were watching.
      .orderBy(desc(documents.documentDate), desc(documents.id))

    return rows.map((r) => ({
      ...r.document,
      patientName: r.patient ? (r.patient.nameTebra ?? r.patient.nameIntakeq) : null,
      patientDob: r.patient ? (r.patient.dobTebra ?? r.patient.dobIntakeq) : null,
    }))
  })
}

export async function getDocument(id: number) {
  const [row] = await getDb().select().from(documents).where(eq(documents.id, id))
  return row ?? null
}

// The route that inserts these owns cache invalidation (matching
// insurance-card/route.ts's precedent), not this function -- a plain insert
// has no "which cached view is now stale" knowledge of its own.
export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  const [created] = await getDb().insert(documents).values(input).returning()
  return created
}

// Not cached: documentsListCacheKey() is list-wide (all patients' documents
// together), so caching this per-patient query under that key would return
// the wrong patient's documents on a cache hit. No per-patient documents
// cache key exists, and this plan doesn't add one.
export async function listDocumentsForPatient(patientId: string): Promise<DocumentRow[]> {
  return getDb()
    .select()
    .from(documents)
    .where(eq(documents.patientId, patientId))
    .orderBy(desc(documents.documentDate), desc(documents.id))
}

export async function isAdmissionForPatient(admissionId: number, patientId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: admissions.id })
    .from(admissions)
    .where(and(eq(admissions.id, admissionId), eq(admissions.patientId, patientId)))
  return rows.length > 0
}

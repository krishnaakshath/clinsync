import { getDb } from '@/db/client'
import { documents, patients, admissions, documentTypeEnum } from '@/db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'
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
      .select({
        document: documents,
        // Narrow, raw-`sql` patient columns, NOT `patient: patients` --
        // schema.ts here still declares patients' pre-unification
        // `nameTebra`/`nameIntakeq`/`dobTebra`/`dobIntakeq` columns, but a
        // separate, concurrently-running worktree's migration
        // (`feature/unified-patient-record`) has already collapsed the live
        // shared Neon DB's `patients` table down to single `name`/`dob`
        // columns (the same standing cross-worktree drift Task 1's report on
        // this plan diagnosed). A bare `patient: patients` select spreads
        // every column schema.ts declares and 42703s against the real DB.
        // The left join still makes these null when a document has no
        // patientId, exactly like the old `r.patient ? ... : null` ternary.
        patientName: sql<string | null>`patients.name`,
        patientDob: sql<string | null>`patients.dob`,
      })
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
      patientName: r.patientName,
      patientDob: r.patientDob,
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

export interface UpdateDocumentInput {
  status?: 'new' | 'processed'
  patientId?: string | null
  admissionId?: number | null
  documentType?: DocumentType
  filedByName?: string | null
  filedAt?: Date | null
}

// Applies exactly the fields it's given and makes no policy decisions --
// the route (which knows session identity and the filing/unfiling rules)
// computes what belongs in `input`, including what to clear.
export async function updateDocument(id: number, input: UpdateDocumentInput): Promise<DocumentRow | null> {
  const [row] = await getDb().update(documents).set(input).where(eq(documents.id, id)).returning()
  return row ?? null
}

// Reads the row before deleting it so the route can still read
// fileUrl/name/patientId afterward for Blob cleanup and the audit entry --
// a DELETE's `returning()` would work too, but this mirrors getDocument's
// existing read path instead of introducing a second way to shape the row.
export async function deleteDocument(id: number): Promise<DocumentRow | null> {
  const existing = await getDocument(id)
  if (!existing) return null
  await getDb().delete(documents).where(eq(documents.id, id))
  return existing
}

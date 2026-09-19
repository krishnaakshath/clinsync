import { getDb } from '@/db/client'
import { documents, patients } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getOrSetCache, documentsListCacheKey } from '@/lib/cache'

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

import { getDb } from '@/db/client'
import { documents, patients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, documentsListCacheKey } from '@/lib/cache'

export async function listDocuments() {
  return getOrSetCache(documentsListCacheKey(), 15, async () => {
    const rows = await getDb()
      .select({ document: documents, patient: patients })
      .from(documents)
      .leftJoin(patients, eq(documents.patientId, patients.id))

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

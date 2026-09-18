import { getDb } from '@/db/client'
import { faxes, patients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, faxesListCacheKey } from '@/lib/cache'

export async function listFaxes() {
  return getOrSetCache(faxesListCacheKey(), 15, async () => {
    const rows = await getDb()
      .select({ fax: faxes, patient: patients })
      .from(faxes)
      .leftJoin(patients, eq(faxes.patientId, patients.id))

    return rows.map((r) => ({
      ...r.fax,
      patientName: r.patient ? (r.patient.nameTebra ?? r.patient.nameIntakeq) : null,
      patientDob: r.patient ? (r.patient.dobTebra ?? r.patient.dobIntakeq) : null,
    }))
  })
}

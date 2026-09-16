import { getDb } from '@/db/client'
import { auditLog } from '@/db/schema'
import type { Session } from './auth'

export async function logAudit(session: Session | null, action: string, patientId: string | null) {
  await getDb().insert(auditLog).values({
    userName: session?.name ?? 'unknown',
    role: session?.role ?? 'crc',
    action,
    patientId,
  })
}

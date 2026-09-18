import { getDb } from '@/db/client'
import { auditLog } from '@/db/schema'

// The ONE sanctioned place in this codebase that writes an audit row with no
// real Session behind it. A patient filling out their own intake form has no
// staff session -- that's the entire point of this feature -- so it cannot
// go through logAudit(), which deliberately requires one. Every other write
// in this app still must go through logAudit() with a real session; this
// function exists so that requirement is never silently bypassed anywhere
// else, only here, for exactly this one legitimate case.
export async function logPatientPortalAction(action: string, patientId: string, details?: string): Promise<void> {
  await getDb().insert(auditLog).values({
    userName: 'Patient (self-service)',
    role: null,
    action,
    patientId,
    details,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { rejectCrossOrigin } from '@/lib/csrf'
import { syncFromEhrs } from '@/lib/ehr-sync'
import { EhrConnectorError, EhrNotConfiguredError } from '@/connectors/errors'

// "Sync now": pulls IntakeQ clients + Tebra patients and reconciles them
// (see syncFromEhrs for the invariants -- staff-owned fields are never
// touched). Admin only. Errors are mapped to fixed, credential-free messages.

// Real vendor calls are rate limited (Tebra >= 1s spacing; IntakeQ 10/min on
// the standard plan, 2 calls per new client), so allow a long-running sync.
export const maxDuration = 300
export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request)
  if (csrfRejection) return csrfRejection

  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = await syncFromEhrs()
    await logAudit(session, `ran EHR sync (${result.newPatients} new patients, ${result.newMatches} new identity matches, ${result.refreshedPatients} refreshed)`, null)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof EhrNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof EhrConnectorError) {
      await logAudit(session, `EHR sync failed (${err.vendor ?? 'ehr'}: ${err.kind})`, null)
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    throw err
  }
}

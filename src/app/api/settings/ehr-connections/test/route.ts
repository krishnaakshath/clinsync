import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { rejectCrossOrigin } from '@/lib/csrf'
import { testEhrConnections } from '@/connectors'

// Validates the saved IntakeQ/Tebra credentials with one cheap call each
// (IntakeQ: a /clients search that matches nobody; Tebra: GetPractices).
// Returns only {ok, message} per vendor -- messages are fixed, Clinsync-
// authored strings (see connectors/errors.ts), never vendor text or
// credentials.
export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request)
  if (csrfRejection) return csrfRejection

  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const result = await testEhrConnections()
  await logAudit(session, `tested EHR connections (IntakeQ ${result.intakeq.ok ? 'ok' : 'failed'}, Tebra ${result.tebra.ok ? 'ok' : 'failed'})`, null)
  return NextResponse.json(result)
}

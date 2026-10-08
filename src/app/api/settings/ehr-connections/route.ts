import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { readJsonBody } from '@/lib/http'
import { validateEhrCredentialsInput, missingTebraFields } from '@/lib/ehr-credentials'
import { updateEhrCredentials, getSettingsSummary, getStoredTebraFields } from '@/lib/queries/settings'

// Every field optional and only ever set, never read back -- a blank field
// means "leave what's already stored alone" (see the comment in
// updateEhrCredentials). The saved credentials are decrypted server-side
// only by the connector factory (src/connectors/index.ts) for real IntakeQ/
// Tebra calls; see ./test (validate) and ./sync (Sync now).
//
// Validation (src/lib/ehr-credentials.ts) rejects values that cannot be
// real credentials, and a Tebra save must leave all three Tebra fields on
// file: Tebra authenticates with CustomerKey + User + Password together, so
// storing only some of them would silently produce a connection that can
// never work. Error messages never echo submitted values.
export async function PUT(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const checked = validateEhrCredentialsInput(await readJsonBody(request))
  if (!checked.ok) return NextResponse.json({ error: checked.error, fieldErrors: checked.fieldErrors }, { status: 400 })

  const missing = missingTebraFields(await getStoredTebraFields(), checked.value)
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Tebra needs the customer key, API user and API password together. Missing: ${missing.join(', ')}.`,
      fieldErrors: {},
    }, { status: 400 })
  }

  await updateEhrCredentials(checked.value)
  await logAudit(session, 'updated EHR connection credentials', null)

  const summary = await getSettingsSummary()
  return NextResponse.json({ intakeqConfigured: summary.intakeqConfigured, tebraConfigured: summary.tebraConfigured })
}

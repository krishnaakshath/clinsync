import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { updateEhrCredentials, getSettingsSummary } from '@/lib/queries/settings'

// Every field optional and only ever set, never read back -- a blank field
// means "leave what's already stored alone" (see the comment in
// updateEhrCredentials). The saved credentials are decrypted server-side
// only by the connector factory (src/connectors/index.ts) for real IntakeQ/
// Tebra calls; see ./test (validate) and ./sync (Sync now).
const ehrCredentialsSchema = z.object({
  intakeqApiKey: z.string().trim().optional(),
  tebraCustomerKey: z.string().trim().optional(),
  tebraUser: z.string().trim().optional(),
  tebraPassword: z.string().trim().optional(),
}).strict()

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const parsed = ehrCredentialsSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })

  await updateEhrCredentials(parsed.data)
  await logAudit(session, 'updated EHR connection credentials', null)

  const summary = await getSettingsSummary()
  return NextResponse.json({ intakeqConfigured: summary.intakeqConfigured, tebraConfigured: summary.tebraConfigured })
}

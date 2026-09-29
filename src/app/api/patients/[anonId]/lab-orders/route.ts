import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createLabOrder } from '@/lib/queries/lab-orders'
import { listActiveProviders } from '@/lib/queries/providers'

const createLabOrderSchema = z.object({
  labTestId: z.number().int().positive(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['admin', 'pi'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { anonId } = await params
  const parsed = createLabOrderSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lab order payload', details: parsed.error.flatten() }, { status: 400 })

  // There's no real session<->provider-row link in this codebase yet (see
  // the same best-effort last-name match already used by the inpatient
  // discharge/transfer routes and Front Desk's assignment-schedule route to
  // resolve "this session's own provider row"). Reused here to resolve who
  // ordered this test.
  //
  // Matching discharge's own precedent: a 'pi' session with no resolvable
  // match fails CLOSED (403) rather than being silently attributed to an
  // arbitrary provider -- that precedent (discharge/route.ts) only ever
  // lets 'admin' bypass identity resolution, never 'pi'. Falling back to
  // the first active provider is therefore scoped to 'admin' only, since
  // admin isn't itself a clinical provider but is one of this route's two
  // allowed roles and needs order creation to stay functional. This is a
  // demo-appropriate simplification, not a real identity resolution (spec
  // §4 flags this as an open question with either resolution acceptable) --
  // but it must not silently misattribute a 'pi'-ordered test to the wrong
  // clinician.
  const activeProviders = await listActiveProviders()
  if (activeProviders.length === 0) {
    return NextResponse.json({ error: 'No active providers available to attribute this order to' }, { status: 409 })
  }
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const providerMatch = activeProviders.find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))

  let orderedByProviderId: number
  if (providerMatch) {
    orderedByProviderId = providerMatch.id
  } else if (session.role === 'admin') {
    orderedByProviderId = activeProviders[0].id
  } else {
    return NextResponse.json({ error: 'Could not resolve your provider identity for this session' }, { status: 403 })
  }

  const created = await createLabOrder({ patientId: anonId, labTestId: parsed.data.labTestId, orderedByProviderId })

  await logAudit(session, 'created lab order', anonId)
  return NextResponse.json(created, { status: 201 })
}

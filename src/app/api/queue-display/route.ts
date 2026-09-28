import { NextRequest, NextResponse } from 'next/server'
import { getQueueDisplayPin } from '@/lib/queries/settings'
import { getQueueDisplayRows } from '@/lib/queries/queue-display'

const PIN_HEADER = 'x-queue-display-pin'

// Deliberately does NOT call requireSession() -- this backs a lobby TV with
// no staff login (spec §3), gated instead by a shared PIN checked against
// appSettings.queueDisplayPin. An unset PIN fails closed (401), never
// silently serves real data with no gate at all.
export async function GET(request: NextRequest) {
  const storedPin = await getQueueDisplayPin()
  const suppliedPin = request.headers.get(PIN_HEADER)
  if (!storedPin || !suppliedPin || suppliedPin !== storedPin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tickets = await getQueueDisplayRows()
  return NextResponse.json({ tickets })
}

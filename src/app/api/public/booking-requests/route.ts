import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { providers } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { checkBookingRequestRateLimit } from '@/lib/rate-limit'
import { createBookingRequest } from '@/lib/queries/booking-requests'

// Vercel/most proxies set the client IP as the first entry in
// x-forwarded-for; NextRequest no longer exposes `.ip` directly.
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

const bookingRequestSchema = z.object({
  requesterName: z.string().min(1),
  requesterDob: z.string().min(1),
  requesterEmail: z.string().email().optional(),
  requesterPhone: z.string().min(1).optional(),
  preferredProviderId: z.number().int().positive().optional(),
  preferredDateRangeStart: z.string().min(1),
  preferredDateRangeEnd: z.string().min(1),
  reason: z.string().min(1),
}).strict()

// This is the one genuinely unauthenticated route in the app -- no
// requireSession() here, deliberately. It exists so a prospective patient
// with no account can request an appointment from the public /book widget
// before any staff account or session exists for them. Everything it writes
// lands in booking_requests with status 'pending' and never touches
// patients/appointments directly; a staff member reviews and either
// confirms (Task 3, which creates the real appointment) or declines it.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { allowed } = await checkBookingRequestRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const parsed = bookingRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid booking request payload', details: parsed.error.flatten() }, { status: 400 })

  const start = new Date(parsed.data.preferredDateRangeStart)
  const end = new Date(parsed.data.preferredDateRangeEnd)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: 'preferredDateRangeEnd must be on or after preferredDateRangeStart' }, { status: 400 })
  }

  if (parsed.data.preferredProviderId !== undefined) {
    const [providerRow] = await getDb().select().from(providers).where(eq(providers.id, parsed.data.preferredProviderId))
    if (!providerRow) return NextResponse.json({ error: 'preferredProviderId does not reference a real provider' }, { status: 400 })
  }

  const created = await createBookingRequest({
    requesterName: parsed.data.requesterName,
    requesterDob: parsed.data.requesterDob,
    requesterEmail: parsed.data.requesterEmail ?? null,
    requesterPhone: parsed.data.requesterPhone ?? null,
    preferredProviderId: parsed.data.preferredProviderId ?? null,
    preferredDateRangeStart: parsed.data.preferredDateRangeStart,
    preferredDateRangeEnd: parsed.data.preferredDateRangeEnd,
    reason: parsed.data.reason,
  })

  return NextResponse.json({ id: created.id }, { status: 201 })
}

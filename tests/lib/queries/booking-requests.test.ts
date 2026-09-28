import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { bookingRequests } from '@/db/schema'
import { createBookingRequest } from '@/lib/queries/booking-requests'

const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) await getDb().delete(bookingRequests).where(eq(bookingRequests.id, createdIds.pop()!))
})

describe('createBookingRequest', () => {
  it('inserts a pending request with only the given fields set', async () => {
    const row = await createBookingRequest({
      requesterName: 'Alex Chen',
      requesterDob: '1992-08-01',
      requesterEmail: 'alex@example.com',
      requesterPhone: null,
      preferredProviderId: null,
      preferredDateRangeStart: '2026-11-01',
      preferredDateRangeEnd: '2026-11-10',
      reason: 'Initial consult',
    })
    createdIds.push(row.id)
    expect(row.status).toBe('pending')
    expect(row.reviewedByName).toBeNull()
    expect(row.resultingAppointmentId).toBeNull()
  })
})

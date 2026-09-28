import { getDb } from '@/db/client'
import { bookingRequests } from '@/db/schema'

export interface CreateBookingRequestInput {
  requesterName: string
  requesterDob: string
  requesterEmail: string | null
  requesterPhone: string | null
  preferredProviderId: number | null
  preferredDateRangeStart: string
  preferredDateRangeEnd: string
  reason: string
}

export async function createBookingRequest(input: CreateBookingRequestInput) {
  const [created] = await getDb().insert(bookingRequests).values(input).returning()
  return created
}

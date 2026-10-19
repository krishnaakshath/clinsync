import { describe, it, expect } from 'vitest'
import { practiceLocalToUtc } from '@/lib/timezone'

// Known, independently calculable expected results (Fix I5) -- these are
// standard, well-known UTC offsets for Los Angeles time, calculable without
// running any code. If any of these fail, the conversion technique has a
// bug; the test must not be adjusted to match wrong output.
describe('practiceLocalToUtc', () => {
  it('converts a standard-time (PST, UTC-8) practice-local datetime to UTC', () => {
    expect(practiceLocalToUtc('2024-01-15T10:00:00', 'America/Los_Angeles').toISOString()).toBe('2024-01-15T18:00:00.000Z')
  })

  it('converts a daylight-saving-time (PDT, UTC-7) practice-local datetime to UTC', () => {
    expect(practiceLocalToUtc('2024-07-15T10:00:00', 'America/Los_Angeles').toISOString()).toBe('2024-07-15T17:00:00.000Z')
  })

  it('is the identity conversion for the UTC timezone itself (sanity check against a spurious offset)', () => {
    expect(practiceLocalToUtc('2024-01-15T10:00:00', 'UTC').toISOString()).toBe('2024-01-15T10:00:00.000Z')
  })
})

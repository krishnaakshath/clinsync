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

  // Re-review (fix round) found the single-pass offset computation used the
  // offset in effect at the NAIVE-UTC guess instant rather than the actual
  // target instant -- wrong on a DST-transition day, since those two
  // instants can straddle the transition and therefore have different
  // offsets. These three cases are independently calculable from the known
  // 2024 US DST transition dates (spring-forward: 2024-03-10 2am->3am PST->
  // PDT; fall-back: 2024-11-03 2am PDT->1am PST) and must not be adjusted to
  // match wrong output.
  it('uses the post-transition PDT offset for a spring-forward-day local time after 3am', () => {
    expect(practiceLocalToUtc('2024-03-10T09:00:00', 'America/Los_Angeles').toISOString()).toBe('2024-03-10T16:00:00.000Z')
  })

  it('uses the post-transition PDT offset for a spring-forward-day local time just after the 2am-3am gap', () => {
    expect(practiceLocalToUtc('2024-03-10T03:30:00', 'America/Los_Angeles').toISOString()).toBe('2024-03-10T10:30:00.000Z')
  })

  it('uses the post-transition PST offset for a fall-back-day local time after 2am', () => {
    expect(practiceLocalToUtc('2024-11-03T08:00:00', 'America/Los_Angeles').toISOString()).toBe('2024-11-03T16:00:00.000Z')
  })
})

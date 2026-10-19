/**
 * Converts a practice-local, offset-less datetime string (e.g. from
 * normalizeTebraDateTime's output) into the correct UTC Date, using the
 * practice's IANA timezone. DST-aware: computes the real UTC offset for
 * that specific date/time via Intl.DateTimeFormat rather than a fixed
 * offset, since the offset for a timezone like America/Los_Angeles
 * changes across the year.
 *
 * Why this is needed (Fix I5): `new Date(aStringWithNoOffset)` interprets a
 * date-time string with no offset/`Z` suffix as LOCAL TO THE SERVER'S OWN
 * TIMEZONE -- which on Vercel is UTC, not the practice's timezone. A Tebra
 * appointment time meant as practice-local (e.g. America/Los_Angeles) was
 * being silently reinterpreted as UTC, shifting every synced appointment by
 * the practice's UTC offset (7-8 hours, depending on DST).
 */

/**
 * The offset (ms to ADD to a UTC instant to get that timezone's wall-clock
 * reading, expressed as "if that reading were itself UTC") in effect AT
 * the given instant -- not at some other guessed instant. Re-review found
 * the single-pass version below computed the offset at the naive-UTC guess
 * instant rather than the actual target instant, which is wrong for any
 * local time whose correct offset differs from the one in effect a few
 * hours away in UTC -- i.e. the few hours around a DST transition.
 */
function offsetAt(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const asIfLocal = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  )
  return instant.getTime() - asIfLocal.getTime()
}

export function practiceLocalToUtc(localDateTimeString: string, timeZone: string): Date {
  const naiveUtc = new Date(
    localDateTimeString.endsWith('Z') ? localDateTimeString : `${localDateTimeString}Z`
  )
  // Two-pass: the first offset (computed at naiveUtc) gives a guess that's
  // off by the DST delta on a transition day; recomputing the offset AT
  // that guessed instant (which is now close to the real target instant)
  // yields the offset actually in effect for the practice-local time being
  // converted. A third pass would never change the answer -- the guess is
  // already within the same DST regime after one correction.
  const firstGuess = new Date(naiveUtc.getTime() + offsetAt(naiveUtc, timeZone))
  return new Date(naiveUtc.getTime() + offsetAt(firstGuess, timeZone))
}

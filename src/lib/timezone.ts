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
export function practiceLocalToUtc(localDateTimeString: string, timeZone: string): Date {
  const naiveUtc = new Date(
    localDateTimeString.endsWith('Z') ? localDateTimeString : `${localDateTimeString}Z`
  )
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(naiveUtc)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const asIfLocal = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  )
  const offsetMs = naiveUtc.getTime() - asIfLocal.getTime()
  return new Date(naiveUtc.getTime() + offsetMs)
}

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

const listAppointmentsInRange = vi.fn(async (_start: Date, _end: Date, _providerIds?: number[]) => [])
vi.mock('@/lib/queries/appointments', () => ({ listAppointmentsInRange }))

vi.mock('@/lib/queries/providers', () => ({
  listActiveProviders: vi.fn(async () => [
    { id: 1, name: 'Dr. Rajiv Kunam', colorTag: 'chart-1' },
    { id: 2, name: 'Dr. Elena Bosch', colorTag: 'chart-2' },
  ]),
}))

vi.mock('@/lib/queries/patients', () => ({
  listPatientsWithStatus: vi.fn(async () => [
    { id: 'RD-0001', nameTebra: 'Maria Alvarez', nameIntakeq: 'Maria Alvarez' },
  ]),
}))

describe('/calendar page', () => {
  it('fetches the week range getViewRange produces when no explicit view is given', async () => {
    listAppointmentsInRange.mockClear()
    const { default: CalendarPage } = await import('@/app/(dashboard)/calendar/page')
    const { getViewRange } = await import('@/lib/calendar-dates')

    await CalendarPage({ searchParams: Promise.resolve({}) })

    const expected = getViewRange('week', new Date())
    expect(listAppointmentsInRange).toHaveBeenCalledTimes(1)
    const [calledStart, calledEnd, calledProviderIds] = listAppointmentsInRange.mock.calls[0]
    // Same calendar-day granularity as getViewRange('week', today) -- exact
    // millisecond equality isn't meaningful across two separate `new Date()`
    // calls a few lines apart, so compare the calendar date instead.
    expect(calledStart.toDateString()).toBe(expected.start.toDateString())
    expect(calledEnd.toDateString()).toBe(expected.end.toDateString())
    expect(calledProviderIds).toBeUndefined() // no providerIds param -> no filter
  })

  it('fetches the exact month range for view=month', async () => {
    listAppointmentsInRange.mockClear()
    const { default: CalendarPage } = await import('@/app/(dashboard)/calendar/page')
    const { getViewRange, parseDateParam } = await import('@/lib/calendar-dates')

    await CalendarPage({ searchParams: Promise.resolve({ view: 'month', date: '2026-09-17' }) })

    const anchor = parseDateParam('2026-09-17')
    const expected = getViewRange('month', anchor)
    const [calledStart, calledEnd] = listAppointmentsInRange.mock.calls[0]
    expect(calledStart.toDateString()).toBe(expected.start.toDateString())
    expect(calledEnd.toDateString()).toBe(expected.end.toDateString())
  })

  it('passes an empty providerIds array (not undefined) when the filter is explicitly "Uncheck All"', async () => {
    listAppointmentsInRange.mockClear()
    const { default: CalendarPage } = await import('@/app/(dashboard)/calendar/page')

    await CalendarPage({ searchParams: Promise.resolve({ providerIds: '' }) })

    const [, , calledProviderIds] = listAppointmentsInRange.mock.calls[0]
    expect(calledProviderIds).toEqual([])
  })

  it('passes the parsed provider id list when specific providers are selected', async () => {
    listAppointmentsInRange.mockClear()
    const { default: CalendarPage } = await import('@/app/(dashboard)/calendar/page')

    await CalendarPage({ searchParams: Promise.resolve({ providerIds: '1,2' }) })

    const [, , calledProviderIds] = listAppointmentsInRange.mock.calls[0]
    expect(calledProviderIds).toEqual([1, 2])
  })
})

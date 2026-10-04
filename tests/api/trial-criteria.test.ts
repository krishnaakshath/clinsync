import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { PUT } from '@/app/api/trials/[trialId]/criteria/route'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn() }
})

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))

const call = () =>
  PUT(
    new NextRequest('http://localhost/api/trials/x/criteria', { method: 'PUT', body: JSON.stringify({ ageMin: 18 }) }),
    { params: Promise.resolve({ trialId: 'does-not-exist' }) },
  )

describe('PUT /api/trials/[trialId]/criteria role gate', () => {
  it('returns 401 with no session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await call()).status).toBe(401)
  })

  it('returns 403 for a coordinator', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    expect((await call()).status).toBe(403)
  })
})

const put = (trialId: string, body: unknown) =>
  PUT(
    new NextRequest(`http://localhost/api/trials/${trialId}/criteria`, { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ trialId }) },
  )

describe('PUT /api/trials/[trialId]/criteria as PI', () => {
  let original: typeof trials.$inferSelect | undefined
  beforeEach(async () => {
    vi.mocked(auth.requireSession).mockResolvedValue({ role: 'pi', name: 'Test PI' })
    ;[original] = await getDb().select().from(trials).orderBy(asc(trials.id)).limit(1)
    // Pin the age bounds so tests don't depend on seed values.
    await getDb().update(trials).set({ ageMin: 20, ageMax: 60 }).where(eq(trials.id, original.id))
  })
  afterEach(async () => {
    vi.mocked(auth.requireSession).mockReset()
    if (original) {
      await getDb().update(trials).set({
        ageMin: original.ageMin,
        ageMax: original.ageMax,
        diagnosisCodes: original.diagnosisCodes,
        ratingScales: original.ratingScales,
        medicationClasses: original.medicationClasses,
        exclusionDiagnoses: original.exclusionDiagnoses,
        minRatingScaleScore: original.minRatingScaleScore,
      }).where(eq(trials.id, original.id))
    }
  })

  it('returns 404 JSON for an unknown trial', async () => {
    const res = await put('does-not-exist', { ageMin: 18 })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Trial not found' })
  })

  it('returns 400 when ageMax < ageMin in the payload', async () => {
    const res = await put(original!.id, { ageMin: 50, ageMax: 40 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when a lone ageMax is below the stored ageMin', async () => {
    const res = await put(original!.id, { ageMax: 1 })
    expect(res.status).toBe(400)
  })

  it('returns 400 JSON for a malformed body', async () => {
    const res = await PUT(
      new NextRequest('http://localhost/api/trials/x/criteria', { method: 'PUT', body: '{not json' }),
      { params: Promise.resolve({ trialId: original!.id }) },
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 for an empty-string diagnosis code', async () => {
    const res = await put(original!.id, { diagnosisCodes: [{ code: '  ', description: 'x' }] })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a negative washoutDays', async () => {
    const res = await put(original!.id, { medicationClasses: [{ className: 'SSRI', washoutDays: -1, rule: 'r', ruleType: 'washout_exclusion' }] })
    expect(res.status).toBe(400)
  })

  it('returns 403 for a coordinator on a known trial and leaves the row unchanged', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const res = await put(original!.id, { ageMin: 21, ageMax: 59 })
    expect(res.status).toBe(403)
    const [row] = await getDb().select().from(trials).where(eq(trials.id, original!.id))
    expect([row.ageMin, row.ageMax]).toEqual([20, 60])
  })

  it('updates the criteria and the change is persisted', async () => {
    const res = await put(original!.id, { ageMin: 19, ageMax: 66 })
    expect(res.status).toBe(200)
    const [row] = await getDb().select().from(trials).where(eq(trials.id, original!.id))
    expect([row.ageMin, row.ageMax]).toEqual([19, 66])
  })
})

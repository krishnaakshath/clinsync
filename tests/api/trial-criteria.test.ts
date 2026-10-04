import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PUT } from '@/app/api/trials/[trialId]/criteria/route'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn() }
})

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
    ;[original] = await getDb().select().from(trials).limit(1)
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
    expect(original!.ageMin).toBeGreaterThan(1)
    const res = await put(original!.id, { ageMax: 1 })
    expect(res.status).toBe(400)
  })

  it('updates the criteria and the change is persisted', async () => {
    const res = await put(original!.id, { ageMin: 19, ageMax: 66 })
    expect(res.status).toBe(200)
    const [row] = await getDb().select().from(trials).where(eq(trials.id, original!.id))
    expect([row.ageMin, row.ageMax]).toEqual([19, 66])
  })
})

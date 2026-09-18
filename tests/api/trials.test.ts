import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { trials } from '@/db/schema'
import { eq } from 'drizzle-orm'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

import { GET as listTrials } from '@/app/api/trials/route'
import { PUT as updateCriteria } from '@/app/api/trials/[trialId]/criteria/route'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'crc' as const, name: 'Test CRC' })) }
})

// The PUT test below overwrites nct-adhd-demo-01's medicationClasses with a
// test fixture value. It's idempotent across repeated test runs, but it
// would otherwise permanently corrupt the seeded demo criteria that later
// tasks' UIs display. Snapshot the original row and restore it afterward
// (no seed() per Task 4's ruling — this only touches the one row this file
// mutates).
const TRIAL_ID = 'nct-adhd-demo-01'
let originalMedicationClasses: unknown

beforeAll(async () => {
  const [row] = await getDb().select().from(trials).where(eq(trials.id, TRIAL_ID))
  originalMedicationClasses = row.medicationClasses
})

afterAll(async () => {
  await getDb().update(trials).set({ medicationClasses: originalMedicationClasses as any }).where(eq(trials.id, TRIAL_ID))
})

describe('GET /api/trials', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await listTrials(new NextRequest('http://localhost/api/trials'))
    expect(response.status).toBe(401)
  })

  it('lists all configured trials with their per-trial rules', async () => {
    const response = await listTrials(new NextRequest('http://localhost/api/trials'))
    const body = await response.json()
    expect(body.trials.length).toBe(2)
    expect(body.trials[0].diagnosisCodes).toBeDefined()
  })
})

describe('PUT /api/trials/[trialId]/criteria', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await updateCriteria(
      new NextRequest('http://localhost/api/trials/nct-adhd-demo-01/criteria', { method: 'PUT', body: JSON.stringify({ medicationClasses: [{ className: 'Stimulant', washoutDays: 21, rule: 'Updated rule', ruleType: 'washout_exclusion' as const }] }) }),
      { params: Promise.resolve({ trialId: 'nct-adhd-demo-01' }) }
    )
    expect(response.status).toBe(401)
  })

  it('updates a trial\'s medication classes without affecting other trials', async () => {
    const response = await updateCriteria(
      new NextRequest('http://localhost/api/trials/nct-adhd-demo-01/criteria', { method: 'PUT', body: JSON.stringify({ medicationClasses: [{ className: 'Stimulant', washoutDays: 21, rule: 'Updated rule', ruleType: 'washout_exclusion' as const }] }) }),
      { params: Promise.resolve({ trialId: 'nct-adhd-demo-01' }) }
    )
    expect(response.status).toBe(200)

    const listResponse = await listTrials(new NextRequest('http://localhost/api/trials'))
    const { trials } = await listResponse.json()
    const other = trials.find((t: any) => t.id === 'nct06911112')
    expect(other.medicationClasses).not.toEqual([{ className: 'Stimulant', washoutDays: 21, rule: 'Updated rule', ruleType: 'washout_exclusion' as const }])
  })

  it('rejects a payload containing a field outside the criteria allowlist (mass-assignment attempt)', async () => {
    const response = await updateCriteria(
      new NextRequest('http://localhost/api/trials/nct-adhd-demo-01/criteria', { method: 'PUT', body: JSON.stringify({ id: 'hijacked-id', createdAt: '2000-01-01' }) }),
      { params: Promise.resolve({ trialId: 'nct-adhd-demo-01' }) }
    )
    expect(response.status).toBe(400)

    const listResponse = await listTrials(new NextRequest('http://localhost/api/trials'))
    const { trials } = await listResponse.json()
    expect(trials.find((t: any) => t.id === TRIAL_ID)).toBeDefined()
    expect(trials.find((t: any) => t.id === 'hijacked-id')).toBeUndefined()
  })
})

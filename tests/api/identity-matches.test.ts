import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { identityMatches, patients } from '@/db/schema'
import { inArray, eq } from 'drizzle-orm'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

import { GET as listMatches } from '@/app/api/identity-matches/route'
import { POST as confirmMatch } from '@/app/api/identity-matches/[id]/confirm/route'
import { POST as rejectMatch } from '@/app/api/identity-matches/[id]/reject/route'

// See tests/api/patients.test.ts for why `requireSession` (not `getSession`)
// must be mocked here — requireSession's own implementation calls its
// module-internal getSession, not the re-exported one this file could
// override.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'crc' as const, name: 'Test CRC' })) }
})

// The confirm/reject tests below exercise the only two seeded identity-match
// rows and permanently flip them out of 'pending' — running this file twice
// in a row against the shared, persistent DB (no seed() per Task 4's ruling)
// would otherwise fail the second run with 0 pending matches, and would also
// quietly delete the "Linda Cho" / "Katherine Voss" demo rows other tasks'
// UIs rely on. Record every row's id up front and restore all of them to
// 'pending' when this file is done, rather than reseeding.
let allMatchIds: number[] = []
// Confirming a match now actually creates a patient record (previously it
// only flipped the queue row's status) -- every patient this file's confirm
// tests create must be deleted, or they'd permanently accumulate in the
// shared dev DB on every test run.
const createdPatientIds: string[] = []

beforeAll(async () => {
  const rows = await getDb().select().from(identityMatches)
  allMatchIds = rows.map((r) => r.id)
  // Self-heal: if a previous run left rows non-pending (e.g. it crashed
  // before its own afterAll ran), reset them so this run starts clean.
  if (allMatchIds.length > 0) {
    await getDb().update(identityMatches).set({ status: 'pending' }).where(inArray(identityMatches.id, allMatchIds))
  }
})

afterAll(async () => {
  if (allMatchIds.length > 0) {
    await getDb().update(identityMatches).set({ status: 'pending' }).where(inArray(identityMatches.id, allMatchIds))
  }
  if (createdPatientIds.length > 0) {
    await getDb().delete(patients).where(inArray(patients.id, createdPatientIds))
  }
})

describe('GET /api/identity-matches', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    expect(response.status).toBe(401)
  })

  it('lists pending matches', async () => {
    const response = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    const body = await response.json()
    expect(body.matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('POST /api/identity-matches/[id]/confirm', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(response.status).toBe(401)
  })

  it('confirming a match creates the patient record from both systems and marks the match confirmed', async () => {
    const listResponse = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    const { matches } = await listResponse.json()
    const target = matches[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target.id) }) }
    )
    const body = await response.json()
    expect(body.status).toBe('confirmed')
    expect(typeof body.patientId).toBe('string')
    createdPatientIds.push(body.patientId)

    const [patient] = await getDb().select().from(patients).where(eq(patients.id, body.patientId))
    expect(patient?.nameIntakeq ?? patient?.nameTebra).toBe(target.referralName)
  })

  it('confirming an already-confirmed match is a no-op, never double-processed', async () => {
    const target = allMatchIds[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(404)
  })

  it('a real browser form submission (no Accept: application/json) is redirected back to the queue', async () => {
    // The other seeded row -- still pending, since the previous two tests
    // only touched allMatchIds[0].
    const target = allMatchIds[1]
    const response = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST' }), { params: Promise.resolve({ id: String(target) }) })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/\/identity-matching$/)

    const [confirmed] = await getDb().select().from(identityMatches).where(eq(identityMatches.id, target))
    const [createdPatient] = await getDb().select({ id: patients.id }).from(patients).where(eq(patients.intakeqClientIdRef, confirmed.intakeqClientIdRef))
    if (createdPatient) createdPatientIds.push(createdPatient.id)
  })

  it('rejects a cross-origin form submission (the CSRF attack this queue is exposed to)', async () => {
    const target = allMatchIds[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'https://attacker.example' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(403)
  })

  it('a same-origin submission passes the CSRF gate through to the handler', async () => {
    // Both seeded rows are already confirmed by this point, so the handler
    // itself reports 404 -- what this test verifies is that the CSRF check
    // let the request through to reach that logic at all, rather than being
    // blocked at 403 like the cross-origin case above.
    const target = allMatchIds[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'http://localhost', accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/identity-matches/[id]/reject', () => {
  // Both seeded rows are already consumed by the confirm tests above by the
  // time this suite runs, so listPendingIdentityMatches() would return
  // nothing to reject. Insert a throwaway pending row instead of relying on
  // seed data -- rejecting never creates a patient, so this row itself is
  // the only thing to clean up, via a real delete rather than the
  // reset-to-pending afterAll (which is only for the permanent seeded rows).
  let tempMatchId: number

  beforeAll(async () => {
    const [row] = await getDb().insert(identityMatches).values({
      intakeqClientIdRef: 'enc-iq-test-reject', referralName: 'Test Reject Case', referralDob: '1990-01-01',
      candidateTebraPatientIdRef: 'enc-tb-test-reject', candidateName: 'Test Reject Case', candidateDob: '1990-01-01',
      confidence: 80, status: 'pending',
    }).returning()
    tempMatchId = row.id
  })

  afterAll(async () => {
    await getDb().delete(identityMatches).where(eq(identityMatches.id, tempMatchId))
  })

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await rejectMatch(new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(response.status).toBe(401)
  })

  it('rejecting a match sets its status to rejected', async () => {
    const target = { id: tempMatchId }
    const response = await rejectMatch(
      new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target.id) }) }
    )
    const body = await response.json()
    expect(body.status).toBe('rejected')
  })

  it('rejects a cross-origin form submission (the CSRF attack this queue is exposed to)', async () => {
    const target = allMatchIds[0]
    const response = await rejectMatch(
      new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST', headers: { origin: 'https://attacker.example' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(403)
  })
})

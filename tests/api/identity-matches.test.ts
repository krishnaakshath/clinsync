import { describe, it, expect, vi, afterAll } from 'vitest'
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

// Confirming a match now actually creates a patient record (previously it
// only flipped the queue row's status) -- this file must never touch the two
// permanent seeded "Linda Cho" / "Katherine Voss" demo rows, since resetting
// them to 'pending' after confirming them (the old approach) would let a
// later confirm create a second, duplicate chart for someone who already has
// one. Every test below creates and cleans up its own throwaway match row
// instead.
let tempCounter = 0
async function createTempMatch() {
  const suffix = `${Date.now()}-${tempCounter++}`
  const [row] = await getDb().insert(identityMatches).values({
    intakeqClientIdRef: `enc-iq-test-${suffix}`,
    referralName: `Test Case ${suffix}`,
    referralDob: '1991-02-02',
    candidateTebraPatientIdRef: `enc-tb-test-${suffix}`,
    candidateName: `Test Case ${suffix}`,
    candidateDob: '1991-02-02',
    confidence: 80,
    status: 'pending',
  }).returning()
  return row
}

describe('GET /api/identity-matches', () => {
  const tempMatchIds: number[] = []
  afterAll(async () => {
    if (tempMatchIds.length > 0) await getDb().delete(identityMatches).where(inArray(identityMatches.id, tempMatchIds))
  })

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    expect(response.status).toBe(401)
  })

  it('lists pending matches', async () => {
    const match = await createTempMatch()
    tempMatchIds.push(match.id)
    const response = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    const body = await response.json()
    expect(body.matches.some((m: { id: number }) => m.id === match.id)).toBe(true)
  })
})

describe('POST /api/identity-matches/[id]/confirm', () => {
  const tempMatchIds: number[] = []
  const createdPatientIds: string[] = []

  afterAll(async () => {
    if (createdPatientIds.length > 0) await getDb().delete(patients).where(inArray(patients.id, createdPatientIds))
    if (tempMatchIds.length > 0) await getDb().delete(identityMatches).where(inArray(identityMatches.id, tempMatchIds))
  })

  async function freshMatch() {
    const match = await createTempMatch()
    tempMatchIds.push(match.id)
    return match
  }

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(response.status).toBe(401)
  })

  it('confirming a match creates the patient record from both systems and marks the match confirmed', async () => {
    const match = await freshMatch()
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    const body = await response.json()
    expect(body.status).toBe('confirmed')
    expect(typeof body.patientId).toBe('string')
    createdPatientIds.push(body.patientId)

    const [patient] = await getDb().select().from(patients).where(eq(patients.id, body.patientId))
    expect(patient?.nameIntakeq ?? patient?.nameTebra).toBe(match.referralName)
  })

  it('confirming an already-confirmed match is a no-op, never double-processed', async () => {
    const match = await freshMatch()
    const first = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    createdPatientIds.push((await first.json()).patientId)

    const second = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    expect(second.status).toBe(404)
  })

  it('re-confirming a match that was somehow reset to pending links the existing patient instead of duplicating it', async () => {
    const match = await freshMatch()
    const first = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    const firstPatientId = (await first.json()).patientId
    createdPatientIds.push(firstPatientId)

    // Simulate the row being reset back to pending (e.g. by a bug elsewhere)
    await getDb().update(identityMatches).set({ status: 'pending' }).where(eq(identityMatches.id, match.id))

    const second = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    const secondBody = await second.json()
    expect(secondBody.patientId).toBe(firstPatientId)

    const allPatientsForRef = await getDb().select({ id: patients.id }).from(patients).where(eq(patients.intakeqClientIdRef, match.intakeqClientIdRef))
    expect(allPatientsForRef.length).toBe(1)
  })

  it('a real browser form submission (no Accept: application/json) is redirected back to the queue', async () => {
    const match = await freshMatch()
    const response = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST' }), { params: Promise.resolve({ id: String(match.id) }) })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/\/identity-matching$/)

    const [createdPatient] = await getDb().select({ id: patients.id }).from(patients).where(eq(patients.intakeqClientIdRef, match.intakeqClientIdRef))
    if (createdPatient) createdPatientIds.push(createdPatient.id)
  })

  it('rejects a cross-origin form submission (the CSRF attack this queue is exposed to)', async () => {
    // The CSRF check runs before any row lookup, so an arbitrary id is fine.
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'https://attacker.example' } }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(response.status).toBe(403)
  })

  it('a same-origin submission passes the CSRF gate through to the handler', async () => {
    // An id that doesn't exist -- what this test verifies is that the CSRF
    // check let the request through to reach the handler's own 404 logic,
    // rather than being blocked at 403 like the cross-origin case above.
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'http://localhost', accept: 'application/json' } }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/identity-matches/[id]/reject', () => {
  const tempMatchIds: number[] = []
  afterAll(async () => {
    if (tempMatchIds.length > 0) await getDb().delete(identityMatches).where(inArray(identityMatches.id, tempMatchIds))
  })

  async function freshMatch() {
    const match = await createTempMatch()
    tempMatchIds.push(match.id)
    return match
  }

  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await rejectMatch(new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(response.status).toBe(401)
  })

  it('rejecting a match sets its status to rejected', async () => {
    const match = await freshMatch()
    const response = await rejectMatch(
      new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(match.id) }) }
    )
    const body = await response.json()
    expect(body.status).toBe('rejected')
  })

  it('rejects a cross-origin form submission (the CSRF attack this queue is exposed to)', async () => {
    const response = await rejectMatch(
      new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST', headers: { origin: 'https://attacker.example' } }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(response.status).toBe(403)
  })
})

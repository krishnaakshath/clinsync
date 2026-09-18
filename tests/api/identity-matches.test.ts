import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { identityMatches } from '@/db/schema'
import { inArray } from 'drizzle-orm'

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

  it('confirming a match sets its status to confirmed, never auto-decided', async () => {
    const listResponse = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    const { matches } = await listResponse.json()
    const target = matches[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target.id) }) }
    )
    const body = await response.json()
    expect(body.status).toBe('confirmed')
  })

  it('a real browser form submission (no Accept: application/json) is redirected back to the queue', async () => {
    // Reuses the row the previous test already confirmed rather than pulling
    // a fresh one from the pending list — the route sets status
    // unconditionally regardless of its current value, and there are only 2
    // seeded pending rows total, so consuming a second one here would starve
    // the reject test below.
    const target = allMatchIds[0]
    const response = await confirmMatch(new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST' }), { params: Promise.resolve({ id: String(target) }) })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/\/identity-matching$/)
  })

  it('rejects a cross-origin form submission (the CSRF attack this queue is exposed to)', async () => {
    const target = allMatchIds[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'https://attacker.example' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(403)
  })

  it('allows a same-origin form submission through', async () => {
    const target = allMatchIds[0]
    const response = await confirmMatch(
      new NextRequest('http://localhost/api/identity-matches/x/confirm', { method: 'POST', headers: { origin: 'http://localhost', accept: 'application/json' } }),
      { params: Promise.resolve({ id: String(target) }) }
    )
    expect(response.status).toBe(200)
  })
})

describe('POST /api/identity-matches/[id]/reject', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const response = await rejectMatch(new NextRequest('http://localhost/api/identity-matches/x/reject', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
    expect(response.status).toBe(401)
  })

  it('rejecting a match sets its status to rejected', async () => {
    const listResponse = await listMatches(new NextRequest('http://localhost/api/identity-matches'))
    const { matches } = await listResponse.json()
    const target = matches[matches.length - 1]
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

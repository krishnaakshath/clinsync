import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { GET as listUsers, POST as createUser } from '@/app/api/users/route'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'admin' as const, name: 'Test Admin' })) }
})

// Every successful POST inserts a real row into the shared dev DB -- track
// and delete every one this file creates.
const createdIds: number[] = []
afterEach(async () => {
  if (createdIds.length > 0) {
    await getDb().delete(users).where(inArray(users.id, createdIds))
    createdIds.length = 0
  }
})

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/users', { method: 'POST', body: JSON.stringify(body) })
}

describe('GET /api/users', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const res = await listUsers()
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const res = await listUsers()
    expect(res.status).toBe(403)
  })

  it('returns the staff roster without any password field', async () => {
    const res = await listUsers()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    for (const row of body) {
      expect(row).not.toHaveProperty('passwordHash')
      expect(row).not.toHaveProperty('password')
    }
  })
})

describe('POST /api/users', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const res = await createUser(postReq({ name: 'Test User', email: 'newstaff.test@example.com', role: 'crc' }))
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'pi', name: 'Test PI' })
    const res = await createUser(postReq({ name: 'Test User', email: 'newstaff.test@example.com', role: 'crc' }))
    expect(res.status).toBe(403)
  })

  it('rejects an invalid email', async () => {
    const res = await createUser(postReq({ name: 'Test User', email: 'not-an-email', role: 'crc' }))
    expect(res.status).toBe(400)
  })

  it('rejects an invalid role', async () => {
    const res = await createUser(postReq({ name: 'Test User', email: 'newstaff.test@example.com', role: 'superadmin' }))
    expect(res.status).toBe(400)
  })

  it('rejects an unexpected extra field (.strict() enforcement)', async () => {
    const res = await createUser(postReq({ name: 'Test User', email: 'newstaff.test@example.com', role: 'crc', passwordHash: 'x' }))
    expect(res.status).toBe(400)
  })

  it('creates a real staff account and returns the plaintext password once', async () => {
    const res = await createUser(postReq({ name: 'Test New Coordinator', email: 'newstaff.test@example.com', role: 'crc' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    createdIds.push(body.id)
    expect(body.name).toBe('Test New Coordinator')
    expect(body.email).toBe('newstaff.test@example.com')
    expect(body.role).toBe('crc')
    expect(typeof body.password).toBe('string')
    expect(body.password.length).toBeGreaterThan(5)
  })

  it('rejects creating a second account with the same email', async () => {
    const first = await createUser(postReq({ name: 'Test User One', email: 'duplicate.test@example.com', role: 'crc' }))
    const firstBody = await first.json()
    createdIds.push(firstBody.id)

    const second = await createUser(postReq({ name: 'Test User Two', email: 'duplicate.test@example.com', role: 'pi' }))
    expect(second.status).toBe(409)
  })
})

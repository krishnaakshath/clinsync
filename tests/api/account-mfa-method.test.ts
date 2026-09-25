import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { PUT } from '@/app/api/account/mfa-method/route'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/password'

const createdIds: number[] = []
afterEach(async () => {
  while (createdIds.length > 0) await getDb().delete(users).where(eq(users.id, createdIds.pop()!))
})

async function makeSessionCookieFor(name: string, role: 'crc') {
  const { buildSessionCookieValue } = await import('@/lib/auth')
  return buildSessionCookieValue(role, name)
}

describe('PUT /api/account/mfa-method', () => {
  it('rejects switching to sms when no phone is provided and none is on file', async () => {
    const [created] = await getDb().insert(users).values({ name: 'Method Test User', email: 'method-test-user@example.com', role: 'crc', passwordHash: hashPassword('MethodTest123!'), mfaMethod: 'totp' }).returning()
    createdIds.push(created.id)

    const cookie = await makeSessionCookieFor('Method Test User', 'crc')
    const req = new Request('http://localhost/api/account/mfa-method', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: `clinsync_demo_session=${cookie}` },
      body: JSON.stringify({ method: 'sms' }),
    })
    const res = await PUT(req as never)
    expect(res.status).toBe(400)
  })

  it('switches to sms and stores the phone when one is provided', async () => {
    const [created] = await getDb().insert(users).values({ name: 'Method Test User 2', email: 'method-test-user-2@example.com', role: 'crc', passwordHash: hashPassword('MethodTest123!'), mfaMethod: 'totp' }).returning()
    createdIds.push(created.id)

    const cookie = await makeSessionCookieFor('Method Test User 2', 'crc')
    const req = new Request('http://localhost/api/account/mfa-method', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: `clinsync_demo_session=${cookie}` },
      body: JSON.stringify({ method: 'sms', phone: '+15559876543' }),
    })
    const res = await PUT(req as never)
    expect(res.status).toBe(200)

    const [row] = await getDb().select().from(users).where(eq(users.id, created.id))
    expect(row.mfaMethod).toBe('sms')
    expect(row.phone).toBe('+15559876543')
    expect(row.mfaSecretEncrypted).toBeNull()
    expect(row.mfaEnabled).toBe(false)
  })
})

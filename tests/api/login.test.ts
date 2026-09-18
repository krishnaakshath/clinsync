import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/password'
import { POST as login } from '@/app/api/login/route'

const TEST_HASH = hashPassword('s3cret-pass')

beforeAll(() => {
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com')
  vi.stubEnv('ADMIN_PASSWORD_HASH', TEST_HASH)
  vi.stubEnv('ADMIN_NAME', 'Test Admin')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

function req(body: unknown) {
  return new NextRequest('http://localhost/api/login', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/login', () => {
  it('accepts the correct admin email and password', async () => {
    const res = await login(req({ email: 'admin@example.com', password: 's3cret-pass' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const res = await login(req({ email: 'admin@example.com', password: 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('rejects an email that is not the admin account', async () => {
    const res = await login(req({ email: 'someone-else@example.com', password: 's3cret-pass' }))
    expect(res.status).toBe(401)
  })

  it('rejects a payload with an unexpected extra field', async () => {
    const res = await login(req({ email: 'admin@example.com', password: 's3cret-pass', role: 'admin' }))
    expect(res.status).toBe(400)
  })

  it('rejects a malformed email', async () => {
    const res = await login(req({ email: 'not-an-email', password: 's3cret-pass' }))
    expect(res.status).toBe(400)
  })
})

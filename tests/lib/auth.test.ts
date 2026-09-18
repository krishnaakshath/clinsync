// @vitest-environment node
//
// This file is forced onto the plain Node environment rather than the
// project-wide jsdom default: jose's HS256 signer does a strict
// `instanceof Uint8Array` check, and under jsdom that check runs against a
// *different* global realm than the one `new TextEncoder().encode()` (used
// by src/lib/auth.ts) constructs its value in -- so a genuine Uint8Array
// fails jose's own type guard with a jsdom-only, false-positive
// "must be one of type ... Received an instance of Uint8Array" error.
// Confirmed by reproducing the exact same jose call in plain Node (works)
// vs under vitest's jsdom environment (fails) before adding this directive.
import { describe, it, expect } from 'vitest'
import { parseSessionCookie, buildSessionCookieValue } from '@/lib/auth'

describe('auth session cookie', () => {
  it('round-trips role and name through the cookie value', async () => {
    const value = await buildSessionCookieValue('pi', 'Dr. R. Kunam')
    const parsed = await parseSessionCookie(value)
    expect(parsed).toEqual({ role: 'pi', name: 'Dr. R. Kunam' })
  })

  it('returns null for a malformed cookie value', async () => {
    expect(await parseSessionCookie('not-json')).toBeNull()
  })

  // Regression test for a real, previously-shipped vulnerability: the cookie
  // used to be a bare JSON.stringify({role, name}) with no signature, so
  // anyone could set `Cookie: clinsync_demo_session={"role":"admin","name":"x"}`
  // and receive a fully authenticated admin session with no password at all.
  // Signing it with a server-only secret (HS256 JWT) means a hand-crafted,
  // unsigned payload must now fail verification.
  it('rejects a hand-crafted, unsigned cookie value claiming admin -- the exact forged-session attack this signing fix closes', async () => {
    const forged = Buffer.from(JSON.stringify({ role: 'admin', name: 'attacker' })).toString('base64')
    expect(await parseSessionCookie(forged)).toBeNull()
    expect(await parseSessionCookie(JSON.stringify({ role: 'admin', name: 'attacker' }))).toBeNull()
  })

  it('rejects a token signed with the wrong secret', async () => {
    const { SignJWT } = await import('jose')
    const wrongSecretToken = await new SignJWT({ role: 'admin', name: 'attacker' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-real-session-secret'))
    expect(await parseSessionCookie(wrongSecretToken)).toBeNull()
  })

  it('rejects an expired token even with a valid signature', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET)
    const expiredToken = await new SignJWT({ role: 'admin', name: 'Sam Patel' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret)
    expect(await parseSessionCookie(expiredToken)).toBeNull()
  })

  it('rejects a validly-signed token with a role outside the enum', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET)
    const tokenWithBadRole = await new SignJWT({ role: 'superadmin', name: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(secret)
    expect(await parseSessionCookie(tokenWithBadRole)).toBeNull()
  })
})

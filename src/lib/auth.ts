import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

export type Role = 'crc' | 'pi' | 'admin'
export interface Session { role: Role; name: string }

const VALID_ROLES: readonly Role[] = ['crc', 'pi', 'admin']
const COOKIE_NAME = 'clinsync_demo_session'
// Absolute session lifetime -- a server-enforced backstop independent of the
// client-side idle timer (SessionTimeoutWarning), which cannot itself expire
// this cookie since it's httpOnly. A full clinic shift plus margin.
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

// SECURITY: the session cookie used to be a bare `JSON.stringify({role, name})`
// with no signature -- anyone could set
// `Cookie: clinsync_demo_session={"role":"admin","name":"x"}` and receive a
// fully authenticated admin session with no password, completely bypassing
// /api/login. Signing it with a server-only secret (HS256 JWT) makes the
// cookie's *contents* untrustworthy without the secret, so forging a session
// now requires compromising the server, not just typing into devtools. This
// was found and independently confirmed by two separate security audits.
// `kind: 'staff'` mirrors patient-session.ts's own `kind: 'patient'` claim --
// without it, the short-lived pending-MFA JWT (mfa-pending-session.ts, which
// also carries `role`+`name` and shares this same SESSION_SECRET) could be
// replayed as a real session by copying its value into this cookie's slot,
// completing a fully authenticated staff login without ever passing the
// TOTP check. Found by task review during the MFA rollout; see
// docs/superpowers/plans/2026-09-23-patient-portal-security-mfa.md.
export async function buildSessionCookieValue(role: Role, name: string): Promise<string> {
  return new SignJWT({ kind: 'staff', role, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret())
}

export async function parseSessionCookie(value: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(value, getSessionSecret())
    // Validate `role` is one of the real enum values, not just "truthy" --
    // an invalid role here previously reached the audit_log insert and
    // crashed with a Postgres enum-constraint violation on every subsequent
    // audited request for that session.
    if (payload.kind === 'staff' && typeof payload.name === 'string' && payload.name.length > 0 && VALID_ROLES.includes(payload.role as Role)) {
      return { role: payload.role as Role, name: payload.name }
    }
    return null
  } catch {
    // Covers a missing/invalid signature, an expired token, and malformed
    // input -- jwtVerify throws for all of these, so an expired session is
    // indistinguishable from a forged one, which is the correct behavior.
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  return raw ? parseSessionCookie(raw) : null
}

export async function setSessionCookie(role: Role, name: string) {
  const store = await cookies()
  const value = await buildSessionCookieValue(role, name)
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export const SESSION_COOKIE_NAME = COOKIE_NAME

/**
 * Every API route that touches PHI-shaped data must call this before doing
 * any cache/DB work, not just for audit-log attribution. Returns the session
 * on success, or a ready-to-return 401 NextResponse on failure — callers do
 * `const result = await requireSession(); if (result instanceof NextResponse) return result`.
 * Centralized here after a review found 3 of 3 patient routes independently
 * "forgot" this check when each called getSession() only for logging.
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return session
}

/**
 * The page-component equivalent of `requireSession()` for API routes.
 *
 * A final security review proved that relying on `(dashboard)/layout.tsx`'s
 * `redirect('/login')` alone is NOT sufficient: with an invalid or missing
 * session, curl against a production build showed the page component's full
 * PHI-shaped content still rendered and streamed into the 307 response body
 * (31KB+ containing real patient names), even though the top-level status
 * was a redirect. Every `(dashboard)` page must call this itself, as the
 * first statement in its component body, and use ITS returned session
 * (never a separate, unchecked `getSession()` call) for anything the page
 * does afterward, including `logAudit`.
 */
export async function requireSessionOrRedirect(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

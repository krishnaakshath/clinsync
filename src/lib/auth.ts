import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

export type Role = 'crc' | 'pi' | 'admin'
export interface Session { role: Role; name: string }

const VALID_ROLES: readonly Role[] = ['crc', 'pi', 'admin']
const COOKIE_NAME = 'clinsync_demo_session'

export function buildSessionCookieValue(role: Role, name: string): string {
  return JSON.stringify({ role, name })
}

export function parseSessionCookie(value: string): Session | null {
  try {
    const parsed = JSON.parse(value)
    // Validate `role` is one of the real enum values, not just "truthy" --
    // an invalid role here previously reached the audit_log insert and
    // crashed with a Postgres enum-constraint violation on every subsequent
    // audited request for that session.
    if (typeof parsed.name === 'string' && parsed.name.length > 0 && VALID_ROLES.includes(parsed.role)) {
      return { role: parsed.role, name: parsed.name }
    }
    return null
  } catch {
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
  store.set(COOKIE_NAME, buildSessionCookieValue(role, name), { httpOnly: true, sameSite: 'lax', path: '/' })
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

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export type Role = 'crc' | 'pi' | 'admin'
export interface Session { role: Role; name: string }

const COOKIE_NAME = 'clinsync_demo_session'

export function buildSessionCookieValue(role: Role, name: string): string {
  return JSON.stringify({ role, name })
}

export function parseSessionCookie(value: string): Session | null {
  try {
    const parsed = JSON.parse(value)
    if (parsed.role && parsed.name) return parsed as Session
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

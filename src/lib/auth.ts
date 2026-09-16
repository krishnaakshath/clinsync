import { cookies } from 'next/headers'

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

import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, parseSessionCookie } from '@/lib/auth'

export function proxy(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const hasValidSession = raw ? parseSessionCookie(raw) !== null : false

  if (!hasValidSession && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|intake).*)'] }

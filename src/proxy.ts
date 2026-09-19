import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, parseSessionCookie } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const hasValidSession = raw ? (await parseSessionCookie(raw)) !== null : false

  if (!hasValidSession && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

// patient-portal is excluded the same way intake is: it's a separate
// patient-facing area gated by its own session mechanism
// (lib/patient-session.ts, a distinct cookie), not this staff session --
// without this exclusion every patient-portal request would get redirected
// to the staff /login page before patient-portal's own auth check ever runs.
// icon is excluded because it's the app's generated favicon (src/app/icon.tsx)
// -- browsers request it directly, with no session cookie, on every page
// including /login itself, so gating it here would leave the browser tab
// with a broken icon for anyone not currently signed in.
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|intake|patient-portal).*)'] }

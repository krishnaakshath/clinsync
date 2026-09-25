import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForIdentity, verifyState } from '@/lib/google-oauth'
import { getPendingGoogleOAuth, clearPendingGoogleOAuthCookie } from '@/lib/mfa-pending-session'
import { setSessionCookie } from '@/lib/auth'
import { findUserByEmail } from '@/lib/queries/users'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json({ error: 'Google sign-in is not configured for this practice yet.' }, { status: 500 })
  }

  // `new URL(request.url)` rather than `request.nextUrl` -- this route is
  // exercised in tests with a plain Web `Request` (no `.nextUrl` extension),
  // matching the same pattern already used by appointments/reviews/search's
  // route handlers.
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return NextResponse.json({ error: 'Invalid Google sign-in response' }, { status: 400 })

  const pending = await getPendingGoogleOAuth()
  if (!pending || !verifyState(pending.state, state)) {
    return NextResponse.json({ error: 'This sign-in link has expired or is invalid. Please try again.' }, { status: 400 })
  }
  await clearPendingGoogleOAuthCookie()

  let identity
  try {
    identity = await exchangeCodeForIdentity({
      code,
      codeVerifier: pending.codeVerifier,
      clientId,
      clientSecret,
      redirectUri: `${appUrl}/api/auth/google/callback`,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not verify your Google sign-in.' }, { status: 400 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && identity.email.toLowerCase() === adminEmail.toLowerCase()) {
    await setSessionCookie('admin', process.env.ADMIN_NAME ?? 'Admin')
    await logAudit({ role: 'admin', name: process.env.ADMIN_NAME ?? 'Admin' }, 'logged in via Google SSO', null)
    return NextResponse.redirect(`${appUrl}/`)
  }

  // googleSub first (a real link from a prior sign-in), then email as a
  // fallback for a first-ever Google sign-in on an existing account -- never
  // creates a row that doesn't already exist (see spec §5: SSO never
  // auto-provisions staff).
  const [bySub] = await getDb().select().from(users).where(eq(users.googleSub, identity.sub))
  const user = bySub ?? (await findUserByEmail(identity.email))
  if (!user) {
    return NextResponse.json({ error: 'No Clinsync account is linked to this Google account. Ask an admin to add you.' }, { status: 403 })
  }

  if (!bySub) {
    await getDb().update(users).set({ googleSub: identity.sub }).where(eq(users.id, user.id))
  }

  await setSessionCookie(user.role, user.name)
  await logAudit({ role: user.role, name: user.name }, 'logged in via Google SSO', null)
  return NextResponse.redirect(`${appUrl}/`)
}

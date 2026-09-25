import { NextResponse } from 'next/server'
import { generatePkcePair, generateState, buildGoogleAuthUrl } from '@/lib/google-oauth'
import { setPendingGoogleOAuthCookie } from '@/lib/mfa-pending-session'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !appUrl) {
    return NextResponse.json({ error: 'Google sign-in is not configured for this practice yet.' }, { status: 500 })
  }

  const state = generateState()
  const { verifier, challenge } = generatePkcePair()
  await setPendingGoogleOAuthCookie({ state, codeVerifier: verifier })

  const authUrl = buildGoogleAuthUrl({
    clientId,
    redirectUri: `${appUrl}/api/auth/google/callback`,
    state,
    codeChallenge: challenge,
  })
  return NextResponse.redirect(authUrl)
}

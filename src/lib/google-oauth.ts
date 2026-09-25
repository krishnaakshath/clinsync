import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUER_VALUES = ['https://accounts.google.com', 'accounts.google.com']

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getGoogleJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  return _jwks
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function generateState(): string {
  return randomBytes(16).toString('base64url')
}

// Constant-time comparison so a timing side-channel can't help an attacker
// guess the expected state value -- same discipline as password/OTP
// comparisons elsewhere in this codebase.
export function verifyState(expected: string, actual: string): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

export function buildGoogleAuthUrl({ clientId, redirectUri, state, codeChallenge }: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface GoogleIdentity {
  sub: string
  email: string
}

/**
 * Exchanges an authorization code for tokens, then verifies the returned ID
 * token's signature against Google's published JWKS (never trusts an
 * unverified JWT's claims) and checks the issuer/audience match this app's
 * client id before returning the identity it asserts.
 */
export async function exchangeCodeForIdentity({ code, codeVerifier, clientId, clientSecret, redirectUri }: { code: string; codeVerifier: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<GoogleIdentity> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${detail}`)
  }
  const { id_token: idToken } = await tokenRes.json()
  if (!idToken) throw new Error('Google did not return an id_token')

  const { payload } = await jwtVerify(idToken, getGoogleJwks(), { audience: clientId })
  if (typeof payload.iss !== 'string' || !GOOGLE_ISSUER_VALUES.includes(payload.iss)) {
    throw new Error('Unexpected token issuer')
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Google identity token is missing sub/email')
  }

  return { sub: payload.sub, email: payload.email }
}

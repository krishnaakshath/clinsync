import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

const ISSUER = 'Clinsync'

export interface MfaEnrollment {
  secretBase32: string
  qrDataUrl: string
}

// Generates a fresh TOTP secret and a scannable QR code for it. Returns the
// secret in plaintext base32 -- callers are responsible for encrypting it
// with lib/crypto.ts before it ever reaches a database row; this module
// never touches storage.
export async function generateMfaEnrollment(accountLabel: string): Promise<MfaEnrollment> {
  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({ issuer: ISSUER, label: accountLabel, algorithm: 'SHA1', digits: 6, period: 30, secret })
  const qrDataUrl = await QRCode.toDataURL(totp.toString())
  return { secretBase32: secret.base32, qrDataUrl }
}

// window: 1 tolerates the code from the immediately preceding or following
// 30s period, absorbing normal clock drift between the server and the
// authenticator app without meaningfully widening the guessable window.
export function verifyMfaCode(secretBase32: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({ issuer: ISSUER, label: 'verify', algorithm: 'SHA1', digits: 6, period: 30, secret: secretBase32 })
  return totp.validate({ token: code, window: 1 }) !== null
}

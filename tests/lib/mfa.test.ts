import { describe, it, expect } from 'vitest'
import * as OTPAuth from 'otpauth'
import { generateMfaEnrollment, verifyMfaCode } from '@/lib/mfa'

describe('generateMfaEnrollment', () => {
  it('returns a base32 secret and a scannable QR data URL', async () => {
    const enrollment = await generateMfaEnrollment('test@example.com')
    expect(enrollment.secretBase32).toMatch(/^[A-Z2-7]+=*$/)
    expect(enrollment.qrDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('verifyMfaCode', () => {
  it('accepts the current valid code', () => {
    const secret = new OTPAuth.Secret({ size: 20 })
    const totp = new OTPAuth.TOTP({ issuer: 'Clinsync', label: 'test', algorithm: 'SHA1', digits: 6, period: 30, secret })
    expect(verifyMfaCode(secret.base32, totp.generate())).toBe(true)
  })

  it('rejects a wrong code', () => {
    const secret = new OTPAuth.Secret({ size: 20 })
    expect(verifyMfaCode(secret.base32, '000000')).toBe(false)
  })

  it('accepts a code from one period ago (clock-drift tolerance)', () => {
    const secret = new OTPAuth.Secret({ size: 20 })
    const totp = new OTPAuth.TOTP({ issuer: 'Clinsync', label: 'test', algorithm: 'SHA1', digits: 6, period: 30, secret })
    const oneStepAgo = totp.generate({ timestamp: Date.now() - 30_000 })
    expect(verifyMfaCode(secret.base32, oneStepAgo)).toBe(true)
  })

  it('rejects a code from two periods ago (outside the drift window)', () => {
    const secret = new OTPAuth.Secret({ size: 20 })
    const totp = new OTPAuth.TOTP({ issuer: 'Clinsync', label: 'test', algorithm: 'SHA1', digits: 6, period: 30, secret })
    const twoStepsAgo = totp.generate({ timestamp: Date.now() - 60_000 })
    expect(verifyMfaCode(secret.base32, twoStepsAgo)).toBe(false)
  })
})

import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/cache'

// Login has no user table to lock out and no CAPTCHA, so this is the only
// brute-force defense on the one admin credential this pilot has. Keyed by
// IP+email (not just IP) so one attacker rotating source IPs against a
// single account is still throttled, while a shared clinic IP with several
// staff logging in isn't punished for someone else's typo.
let _loginLimiter: Ratelimit | null = null
function getLoginLimiter() {
  if (!_loginLimiter) {
    _loginLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'ratelimit:login',
    })
  }
  return _loginLimiter
}

export async function checkLoginRateLimit(ip: string, email: string): Promise<{ allowed: boolean }> {
  const { success } = await getLoginLimiter().limit(`${ip}:${email.toLowerCase()}`)
  return { allowed: success }
}

// Staff self-service MFA reset (POST /api/account/mfa/reset) re-verifies a
// password, so it's a password-guessing surface exactly like login -- and a
// more dangerous one: someone holding a stolen staff session who guesses the
// real password there can clear MFA, then log in fresh and enroll their own
// authenticator, turning a temporary session hijack into a permanent
// takeover. Same 5-per-60s per-IP window as checkLoginRateLimit, in its own
// bucket (so it never shares a counter with real logins), plus the same
// IP-independent backstop the other dual-bucket limiters use: the per-IP key
// trusts the client-supplied x-forwarded-for header, so without the
// identity-only bucket an attacker could rotate a spoofed IP per guess.
// Keyed on the submitted email (lowercased), since the route doesn't yet
// know which branch (env admin vs DB user) that email resolves to when it
// has to decide whether to allow the attempt.
let _accountMfaResetLimiter: Ratelimit | null = null
function getAccountMfaResetLimiter() {
  if (!_accountMfaResetLimiter) {
    _accountMfaResetLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'ratelimit:account-mfa-reset',
    })
  }
  return _accountMfaResetLimiter
}

let _accountMfaResetGlobalLimiter: Ratelimit | null = null
function getAccountMfaResetGlobalLimiter() {
  if (!_accountMfaResetGlobalLimiter) {
    _accountMfaResetGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '600 s'),
      prefix: 'ratelimit:account-mfa-reset-global',
    })
  }
  return _accountMfaResetGlobalLimiter
}

export async function checkAccountMfaResetRateLimit(ip: string, email: string): Promise<{ allowed: boolean }> {
  const identity = email.toLowerCase()
  const [perIp, global] = await Promise.all([
    getAccountMfaResetLimiter().limit(`${ip}:${identity}`),
    getAccountMfaResetGlobalLimiter().limit(identity),
  ])
  return { allowed: perIp.success && global.success }
}

// Separate bucket from the password-check limiter above -- a correct
// password shouldn't share a counter with brute-forcing the 6-digit TOTP
// code that comes after it.
let _staffMfaLimiter: Ratelimit | null = null
function getStaffMfaLimiter() {
  if (!_staffMfaLimiter) {
    _staffMfaLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'ratelimit:mfa-verify-staff',
    })
  }
  return _staffMfaLimiter
}

// A second, IP-independent bucket keyed on identity alone: the per-IP
// limiter above trusts the client-supplied `x-forwarded-for` header (see
// getClientIp in the login routes), so an attacker can get a fresh 5-attempt
// budget on every single guess just by sending a different spoofed IP each
// time -- no botnet needed, just a header change per request. This catches
// sustained TOTP guessing against one staff account regardless of how many
// (real or spoofed) IPs it comes from. Slower and wider than the per-IP
// bucket -- it's the backstop, not the primary defense, and shouldn't lock
// out a staff member's own handful of mistyped codes. Same shape as
// checkPatientLoginRateLimit's dual-bucket defense against the identical
// threat model.
let _staffMfaGlobalLimiter: Ratelimit | null = null
function getStaffMfaGlobalLimiter() {
  if (!_staffMfaGlobalLimiter) {
    _staffMfaGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '600 s'),
      prefix: 'ratelimit:mfa-verify-staff-global',
    })
  }
  return _staffMfaGlobalLimiter
}

export async function checkStaffMfaRateLimit(ip: string, identity: string): Promise<{ allowed: boolean }> {
  const [perIp, global] = await Promise.all([
    getStaffMfaLimiter().limit(`${ip}:${identity}`),
    getStaffMfaGlobalLimiter().limit(identity),
  ])
  return { allowed: perIp.success && global.success }
}

// Same defense, separate bucket -- a patient hammering their own portal
// login (or an attacker guessing patient IDs) must never be able to affect
// or be affected by the staff login limiter's counters.
let _patientLoginLimiter: Ratelimit | null = null
function getPatientLoginLimiter() {
  if (!_patientLoginLimiter) {
    _patientLoginLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'ratelimit:patient-login',
    })
  }
  return _patientLoginLimiter
}

// A second, IP-independent bucket keyed on patientId alone: the per-IP
// limiter above is defeated by an attacker rotating source addresses (a
// real risk for `x-forwarded-for`-derived IPs, which aren't authenticated),
// so this catches sustained guessing against one patient account regardless
// of how many IPs it comes from. Slower and wider than the per-IP bucket --
// it's the backstop, not the primary defense, and shouldn't lock out a
// patient's own handful of real typos.
let _patientLoginGlobalLimiter: Ratelimit | null = null
function getPatientLoginGlobalLimiter() {
  if (!_patientLoginGlobalLimiter) {
    _patientLoginGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '600 s'),
      prefix: 'ratelimit:patient-login-global',
    })
  }
  return _patientLoginGlobalLimiter
}

export async function checkPatientLoginRateLimit(ip: string, patientId: string): Promise<{ allowed: boolean }> {
  // Patient IDs have one fixed canonical case ("RD-0001") and the DB lookup
  // this gates is an exact-case match -- keying on the exact string here
  // (not a lowercased form) keeps the rate-limit bucket and the credential
  // check from ever disagreeing about what counts as "the same" patient id.
  const [perIp, global] = await Promise.all([
    getPatientLoginLimiter().limit(`${ip}:${patientId}`),
    getPatientLoginGlobalLimiter().limit(patientId),
  ])
  return { allowed: perIp.success && global.success }
}

// Separate bucket from the password-check limiter above -- same reasoning as
// checkStaffMfaRateLimit: a correct password shouldn't share a counter with
// brute-forcing the 6-digit TOTP code that comes after it.
let _patientMfaLimiter: Ratelimit | null = null
function getPatientMfaLimiter() {
  if (!_patientMfaLimiter) {
    _patientMfaLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'ratelimit:mfa-verify-patient',
    })
  }
  return _patientMfaLimiter
}

// A second, IP-independent bucket keyed on identity alone -- same defense as
// checkStaffMfaRateLimit's global bucket, against the identical threat model:
// the per-IP limiter above trusts the client-supplied `x-forwarded-for`
// header (see getClientIp in the login routes), so an attacker can get a
// fresh 5-attempt budget on every single guess just by sending a different
// spoofed IP each time. This catches sustained TOTP guessing against one
// patient account regardless of how many (real or spoofed) IPs it comes
// from. Slower and wider than the per-IP bucket -- it's the backstop, not
// the primary defense, and shouldn't lock out a patient's own handful of
// mistyped codes.
let _patientMfaGlobalLimiter: Ratelimit | null = null
function getPatientMfaGlobalLimiter() {
  if (!_patientMfaGlobalLimiter) {
    _patientMfaGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '600 s'),
      prefix: 'ratelimit:mfa-verify-patient-global',
    })
  }
  return _patientMfaGlobalLimiter
}

export async function checkPatientMfaRateLimit(ip: string, patientId: string): Promise<{ allowed: boolean }> {
  const [perIp, global] = await Promise.all([
    getPatientMfaLimiter().limit(`${ip}:${patientId}`),
    getPatientMfaGlobalLimiter().limit(patientId),
  ])
  return { allowed: perIp.success && global.success }
}

// Separate buckets from every other limiter in this file -- an OTP send/verify
// flow is a fresh brute-force surface (a 6-digit code, same guessable space as
// TOTP) and must not share a counter with password or TOTP attempts.
let _otpSendLimiter: Ratelimit | null = null
function getOtpSendLimiter() {
  if (!_otpSendLimiter) {
    _otpSendLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '900 s'),
      prefix: 'ratelimit:otp-send',
    })
  }
  return _otpSendLimiter
}

let _otpSendGlobalLimiter: Ratelimit | null = null
function getOtpSendGlobalLimiter() {
  if (!_otpSendGlobalLimiter) {
    _otpSendGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '900 s'),
      prefix: 'ratelimit:otp-send-global',
    })
  }
  return _otpSendGlobalLimiter
}

export async function checkOtpSendRateLimit(ip: string, identity: string): Promise<{ allowed: boolean }> {
  const [perIp, global] = await Promise.all([
    getOtpSendLimiter().limit(`${ip}:${identity}`),
    getOtpSendGlobalLimiter().limit(identity),
  ])
  return { allowed: perIp.success && global.success }
}

let _otpVerifyLimiter: Ratelimit | null = null
function getOtpVerifyLimiter() {
  if (!_otpVerifyLimiter) {
    _otpVerifyLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '900 s'),
      prefix: 'ratelimit:otp-verify',
    })
  }
  return _otpVerifyLimiter
}

let _otpVerifyGlobalLimiter: Ratelimit | null = null
function getOtpVerifyGlobalLimiter() {
  if (!_otpVerifyGlobalLimiter) {
    _otpVerifyGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '900 s'),
      prefix: 'ratelimit:otp-verify-global',
    })
  }
  return _otpVerifyGlobalLimiter
}

export async function checkOtpVerifyRateLimit(ip: string, identity: string): Promise<{ allowed: boolean }> {
  const [perIp, global] = await Promise.all([
    getOtpVerifyLimiter().limit(`${ip}:${identity}`),
    getOtpVerifyGlobalLimiter().limit(identity),
  ])
  return { allowed: perIp.success && global.success }
}

// The public booking-request route has no session and no credential to
// guess -- an anonymous submitter has no persistent identity before they
// submit, so unlike every other dual-bucket limiter in this file, there's
// nothing to key a global bucket on except a single fixed string. That makes
// this global bucket a genuinely flat, shared cap on total booking
// submissions across the whole app regardless of source IP, defending
// against a botnet rotating (or spoofing) addresses to dodge the per-IP
// bucket. Tighter than login's 5-per-60s: this gates a lower-frequency
// legitimate action (nobody submits multiple real booking requests per
// minute), so the per-IP window is 3-per-300s and the global backstop is
// 20-per-600s.
let _bookingRequestLimiter: Ratelimit | null = null
function getBookingRequestLimiter() {
  if (!_bookingRequestLimiter) {
    _bookingRequestLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(3, '300 s'),
      prefix: 'ratelimit:booking-request',
    })
  }
  return _bookingRequestLimiter
}

let _bookingRequestGlobalLimiter: Ratelimit | null = null
function getBookingRequestGlobalLimiter() {
  if (!_bookingRequestGlobalLimiter) {
    _bookingRequestGlobalLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(20, '600 s'),
      prefix: 'ratelimit:booking-request-global',
    })
  }
  return _bookingRequestGlobalLimiter
}

export async function checkBookingRequestRateLimit(ip: string): Promise<{ allowed: boolean }> {
  const [perIp, global] = await Promise.all([
    getBookingRequestLimiter().limit(ip),
    getBookingRequestGlobalLimiter().limit('global'),
  ])
  return { allowed: perIp.success && global.success }
}

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

export async function checkStaffMfaRateLimit(ip: string, identity: string): Promise<{ allowed: boolean }> {
  const { success } = await getStaffMfaLimiter().limit(`${ip}:${identity}`)
  return { allowed: success }
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

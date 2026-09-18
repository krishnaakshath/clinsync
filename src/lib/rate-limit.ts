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

export async function checkPatientLoginRateLimit(ip: string, patientId: string): Promise<{ allowed: boolean }> {
  const { success } = await getPatientLoginLimiter().limit(`${ip}:${patientId.toLowerCase()}`)
  return { allowed: success }
}

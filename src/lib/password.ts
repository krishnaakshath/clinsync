import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEY_LENGTH = 64

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plaintext, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(plaintext, salt, KEY_LENGTH)
  const expected = Buffer.from(hash, 'hex')
  // Guard the length before timingSafeEqual, which throws on a mismatch
  // instead of returning false -- an attacker-controlled hash length here
  // would otherwise crash the request rather than fail the login cleanly.
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

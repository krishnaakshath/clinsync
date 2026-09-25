import { describe, it, expect } from 'vitest'
import { generatePkcePair, verifyState } from '@/lib/google-oauth'

describe('generatePkcePair', () => {
  it('produces a verifier and a challenge that is the base64url-SHA256 of the verifier', async () => {
    const { createHash } = await import('crypto')
    const { verifier, challenge } = generatePkcePair()
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('produces a different verifier each call', () => {
    const a = generatePkcePair()
    const b = generatePkcePair()
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('verifyState', () => {
  it('returns true only when both states match exactly', () => {
    expect(verifyState('abc123', 'abc123')).toBe(true)
    expect(verifyState('abc123', 'abc124')).toBe(false)
    expect(verifyState('abc123', '')).toBe(false)
  })
})

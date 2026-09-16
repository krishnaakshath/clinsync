import { describe, it, expect } from 'vitest'
import { matchConfidence, classifyMatch } from '@/lib/matcher'

describe('matchConfidence', () => {
  it('returns 100 for an exact name and DOB match', () => {
    expect(matchConfidence({ name: 'Maria Alvarez', dob: '1985-03-12' }, { name: 'Maria Alvarez', dob: '1985-03-12' })).toBe(100)
  })
  it('returns 0 if DOB does not match, regardless of name similarity', () => {
    expect(matchConfidence({ name: 'Maria Alvarez', dob: '1985-03-12' }, { name: 'Maria Alvarez', dob: '1990-01-01' })).toBe(0)
  })
  it('returns a partial score for a close but non-exact name with matching DOB', () => {
    const score = matchConfidence({ name: 'Katherine Voss', dob: '1982-12-05' }, { name: 'Kathryn Voss', dob: '1982-12-05' })
    expect(score).toBeGreaterThan(50)
    expect(score).toBeLessThan(100)
  })
})

describe('classifyMatch', () => {
  it('classifies 95+ as auto', () => { expect(classifyMatch(95)).toBe('auto') })
  it('classifies 40-94 as needs-review', () => { expect(classifyMatch(70)).toBe('needs-review') })
  it('classifies below 40 as no-match', () => { expect(classifyMatch(10)).toBe('no-match') })
})

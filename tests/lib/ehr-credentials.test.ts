import { describe, it, expect } from 'vitest'
import { validateEhrCredentialsInput, missingTebraFields } from '@/lib/ehr-credentials'

describe('validateEhrCredentialsInput', () => {
  it('accepts an empty payload as a no-op', () => {
    expect(validateEhrCredentialsInput({})).toEqual({ ok: true, value: {} })
  })

  it('trims values and drops blank fields (blank means keep the stored value)', () => {
    const r = validateEhrCredentialsInput({ intakeqApiKey: '  0123456789abcdef0123456789abcdef  ', tebraUser: '   ' })
    expect(r).toEqual({ ok: true, value: { intakeqApiKey: '0123456789abcdef0123456789abcdef' } })
  })

  it('rejects an IntakeQ key that is too short or contains whitespace', () => {
    const short = validateEhrCredentialsInput({ intakeqApiKey: 'abc' })
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.fieldErrors.intakeqApiKey).toMatch(/IntakeQ API key/)
    const spaced = validateEhrCredentialsInput({ intakeqApiKey: '0123456789abcdef 0123456789abcdef' })
    expect(spaced.ok).toBe(false)
  })

  it('rejects a Tebra customer key or API user containing whitespace', () => {
    const r = validateEhrCredentialsInput({ tebraCustomerKey: 'ab cd ef gh', tebraUser: 'api user@example.com', tebraPassword: 'pw' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.fieldErrors.tebraCustomerKey).toMatch(/customer key/i)
      expect(r.fieldErrors.tebraUser).toMatch(/API user/)
      expect(r.fieldErrors.tebraPassword).toBeUndefined()
    }
  })

  it('rejects a too-short Tebra customer key and over-long values', () => {
    const r = validateEhrCredentialsInput({ tebraCustomerKey: 'abc', tebraPassword: 'x'.repeat(300) })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.fieldErrors.tebraCustomerKey).toBeDefined()
      expect(r.fieldErrors.tebraPassword).toBeDefined()
    }
  })

  it('rejects unknown keys and non-string values', () => {
    expect(validateEhrCredentialsInput({ other: 'x' }).ok).toBe(false)
    expect(validateEhrCredentialsInput({ tebraUser: 42 }).ok).toBe(false)
    expect(validateEhrCredentialsInput(null).ok).toBe(false)
    expect(validateEhrCredentialsInput('nope').ok).toBe(false)
  })
})

describe('missingTebraFields', () => {
  it('lists the Tebra fields that would still be missing after a save', () => {
    const none = { customerKey: false, user: false, password: false }
    expect(missingTebraFields(none, { tebraCustomerKey: 'abcdef123456' })).toEqual(['API user', 'API password'])
    expect(missingTebraFields(none, { tebraCustomerKey: 'k', tebraUser: 'u', tebraPassword: 'p' })).toEqual([])
    expect(missingTebraFields({ customerKey: true, user: true, password: true }, { tebraPassword: 'new' })).toEqual([])
  })

  it('reports nothing missing when the save does not touch Tebra at all', () => {
    expect(missingTebraFields({ customerKey: false, user: false, password: false }, { intakeqApiKey: 'x' })).toEqual([])
  })
})

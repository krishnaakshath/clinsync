import { describe, it, expect } from 'vitest'
import { listBroadcastRecipientCandidates, simulateBroadcastDelivery, listBroadcasts } from '@/lib/queries/broadcasts'

describe('simulateBroadcastDelivery', () => {
  it('delivers SMS only when a phone number is on file', () => {
    expect(simulateBroadcastDelivery('sms', '909-555-0142', null)).toBe('delivered')
    expect(simulateBroadcastDelivery('sms', null, 'a@example.com')).toBe('failed')
  })

  it('delivers email only when an email address is on file', () => {
    expect(simulateBroadcastDelivery('email', null, 'a@example.com')).toBe('delivered')
    expect(simulateBroadcastDelivery('email', '909-555-0142', null)).toBe('failed')
  })

  it('delivers "both" when at least one contact method is on file', () => {
    expect(simulateBroadcastDelivery('both', null, 'a@example.com')).toBe('delivered')
    expect(simulateBroadcastDelivery('both', null, null)).toBe('failed')
  })
})

describe('listBroadcastRecipientCandidates', () => {
  it('filters by trial', async () => {
    const candidates = await listBroadcastRecipientCandidates({ trialId: 'nct06911112' })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => typeof c.id === 'string')).toBe(true)
  })

  it('filters by overall status', async () => {
    const candidates = await listBroadcastRecipientCandidates({ overallStatus: 'red' })
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('returns patients with no form submission at all when formStatus is "none"', async () => {
    const candidates = await listBroadcastRecipientCandidates({ formStatus: 'none' })
    // Seeded filler patients (RD-0007+) never get a form submission — see Phase 1's seed.
    expect(candidates.some((c) => c.id === 'RD-0007')).toBe(true)
  })
})

describe('listBroadcasts', () => {
  it('returns the seeded broadcast history, most recent first', async () => {
    const rows = await listBroadcasts()
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(new Date(rows[0].sentAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[rows.length - 1].sentAt).getTime())
  })
})

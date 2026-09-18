import { describe, it, expect, vi } from 'vitest'
import { GET as listBroadcasts, POST as createBroadcast } from '@/app/api/broadcasts/route'
import { GET as recipientPreview } from '@/app/api/broadcasts/recipients/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('GET /api/broadcasts', () => {
  it('returns the seeded broadcast history', async () => {
    const res = await listBroadcasts()
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(4)
  })
})

describe('GET /api/broadcasts/recipients', () => {
  it('previews candidates for a filter without creating a broadcast', async () => {
    const req = new Request('http://localhost/api/broadcasts/recipients?trialId=nct06911112')
    const res = await recipientPreview(req as never)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})

describe('POST /api/broadcasts', () => {
  it('rejects an SMS message over 140 characters', async () => {
    const req = new Request('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({ message: 'x'.repeat(141), channel: 'sms' }) })
    const res = await createBroadcast(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects an email broadcast with no subject', async () => {
    const req = new Request('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({ message: 'Hello', channel: 'email' }) })
    const res = await createBroadcast(req as never)
    expect(res.status).toBe(400)
  })

  it('rejects a filter that matches zero patients', async () => {
    const req = new Request('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({ message: 'Hello', channel: 'sms', filterTrialId: 'does-not-exist' }) })
    const res = await createBroadcast(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a broadcast and snapshots the matching recipients', async () => {
    const req = new Request('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({ message: 'Test broadcast from the automated suite', channel: 'sms', filterTrialId: 'nct06911112' }) })
    const res = await createBroadcast(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.recipientCount).toBeGreaterThan(0)
    expect(body.recipients.length).toBe(body.recipientCount)
  })
})

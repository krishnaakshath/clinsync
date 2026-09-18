import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/mock-payments/route'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

describe('POST /api/mock-payments', () => {
  it('rejects a payload with an unknown field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost/api/mock-payments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', chargeId: null, amountCents: 1000, cardNumber: '4242424242424242', expMonth: 12, expYear: 2027, cvc: '123', realProcessor: 'stripe' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('records a success result for a Luhn-valid card number and never returns the card number', async () => {
    const req = new Request('http://localhost/api/mock-payments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', chargeId: null, amountCents: 1000, cardNumber: '4242424242424242', expMonth: 12, expYear: 2027, cvc: '123' }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.result).toBe('success')
    expect(body.cardLast4).toBe('4242')
    expect(JSON.stringify(body)).not.toContain('4242424242424242')
    expect(JSON.stringify(body)).not.toContain('123') // the CVC must never appear in the response
  })

  it('records a failed result for a Luhn-invalid card number', async () => {
    const req = new Request('http://localhost/api/mock-payments', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'RD-0001', chargeId: null, amountCents: 1000, cardNumber: '4242424242424241', expMonth: 12, expYear: 2027, cvc: '123' }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.result).toBe('failed')
  })
})

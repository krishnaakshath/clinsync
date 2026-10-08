import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IdentityVerificationForm } from '@/components/IdentityVerificationForm'

afterEach(() => vi.unstubAllGlobals())

describe('IdentityVerificationForm', () => {
  it('PUTs the ID type and number to the identity route, then reloads', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<IdentityVerificationForm anonId="RD-0001" />)
    fireEvent.change(screen.getByLabelText('ID type'), { target: { value: 'passport' } })
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: ' P1234567 ' } })
    fireEvent.click(screen.getByRole('button', { name: /mark identity verified/i }))
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/patients/RD-0001/identity', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idType: 'passport', idNumber: 'P1234567' }),
    })
  })

  it('requires an ID number before submitting', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<IdentityVerificationForm anonId="RD-0001" />)
    expect(screen.getByRole('button', { name: /mark identity verified/i })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the route error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Patient not found' }), { status: 404 })))
    render(<IdentityVerificationForm anonId="RD-0001" />)
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: 'D123' } })
    fireEvent.click(screen.getByRole('button', { name: /mark identity verified/i }))
    expect(await screen.findByText('Patient not found')).toBeInTheDocument()
  })
})

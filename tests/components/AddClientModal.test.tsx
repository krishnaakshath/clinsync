import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddClientModal } from '@/components/AddClientModal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
afterEach(() => { vi.unstubAllGlobals() })

function fill() {
  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Pat Example' } })
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-01-01' } })
}

describe('AddClientModal', () => {
  it('states plainly that submitting creates a real chart in the connected Tebra practice', () => {
    render(<AddClientModal onClose={vi.fn()} />)
    expect(screen.getByText(/creates a real patient chart in the connected Tebra practice/i)).toBeInTheDocument()
  })

  it('requires an explicit confirmation before it will submit', () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'RD-1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AddClientModal onClose={vi.fn()} />)
    fill()
    const submit = screen.getByRole('button', { name: /create chart in tebra/i })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /real patient chart in tebra/i }))
    expect(submit).toBeEnabled()
  })

  it('shows why the chart could not be created (e.g. Tebra not connected) instead of a generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'EHR connections are not configured: an admin must connect Tebra before new patients can be added.' }), { status: 503 })))
    render(<AddClientModal onClose={vi.fn()} />)
    fill()
    fireEvent.click(screen.getByRole('checkbox', { name: /real patient chart in tebra/i }))
    fireEvent.click(screen.getByRole('button', { name: /create chart in tebra/i }))
    expect(await screen.findByText(/an admin must connect Tebra/)).toBeInTheDocument()
  })

  it('recovers from a network failure instead of staying on Creating…', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<AddClientModal onClose={vi.fn()} />)
    fill()
    fireEvent.click(screen.getByRole('checkbox', { name: /real patient chart in tebra/i }))
    fireEvent.click(screen.getByRole('button', { name: /create chart in tebra/i }))
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
  })
})

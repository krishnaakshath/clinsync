import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CheckInModal } from '@/components/CheckInModal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const PROVIDERS = [{ id: 1, name: 'Dr. R. Kunam' }]
const ROOMS = [{ id: 1, ward: 'Ward A', roomNumber: '101', bedNumber: 'A' }]

describe('CheckInModal', () => {
  it('does not show a room picker for an outpatient visit', () => {
    render(<CheckInModal providers={PROVIDERS} rooms={ROOMS} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/outpatient/i))
    expect(screen.queryByLabelText(/room/i)).not.toBeInTheDocument()
  })

  it('shows a room picker for an inpatient visit', () => {
    render(<CheckInModal providers={PROVIDERS} rooms={ROOMS} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/inpatient/i))
    expect(screen.getByLabelText(/room/i)).toBeInTheDocument()
  })

  it('submits a check-in with the selected provider and visit type', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: 1 }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CheckInModal providers={PROVIDERS} rooms={ROOMS} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/patient id/i), { target: { value: 'RD-0001' } })
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Follow-up' } })
    fireEvent.click(screen.getByText('Check In'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.patientId).toBe('RD-0001')
    expect(body.visitType).toBe('outpatient')

    vi.unstubAllGlobals()
  })
})

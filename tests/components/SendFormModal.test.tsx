import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendFormModal } from '@/components/SendFormModal'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
afterEach(() => { vi.unstubAllGlobals() })

function renderModal(onClose = vi.fn()) {
  render(<SendFormModal templates={[{ id: 7, name: 'PHQ-9' }]} patients={[{ id: 'RD-1', nameTebra: null, nameIntakeq: 'Pat', name: 'Pat' }]} onClose={onClose} />)
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'RD-1' } })
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '7' } })
  fireEvent.click(screen.getByText('Send Form'))
  return onClose
}

describe('SendFormModal', () => {
  it('posts templateId + patientId and closes on success', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = renderModal()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ templateId: 7, patientId: 'RD-1' })
  })

  // Used to do nothing at all on a non-2xx: the modal just sat there.
  it('shows the server error and stays open when sending fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid send-form payload' }), { status: 400 })))
    const onClose = renderModal()
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid send-form payload')
    expect(onClose).not.toHaveBeenCalled()
  })
})

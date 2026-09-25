import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeletePatientDialog } from '@/components/DeletePatientDialog'

describe('DeletePatientDialog', () => {
  it('renders as an accessible dialog that closes on Escape', () => {
    const onClose = vi.fn()
    render(<DeletePatientDialog target={{ id: 'RD-0001', name: 'Test Patient' }} onClose={onClose} onDeleted={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when target is null', () => {
    const { container } = render(<DeletePatientDialog target={null} onClose={vi.fn()} onDeleted={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusChip } from '@/components/StatusChip'

describe('StatusChip', () => {
  it('renders the label text, not just a color', () => {
    render(<StatusChip status="green" />)
    expect(screen.getByText(/meets/i)).toBeInTheDocument()
  })
  it('renders an icon element alongside the label', () => {
    const { container } = render(<StatusChip status="red" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

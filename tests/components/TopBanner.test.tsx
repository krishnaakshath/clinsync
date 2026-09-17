import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBanner } from '@/components/TopBanner'

describe('TopBanner', () => {
  it('shows the product name', () => {
    render(<TopBanner userName="Jamie Ruiz" />)
    expect(screen.getByText('Clinsync')).toBeInTheDocument()
  })
  it('shows the signed-in user name', () => {
    render(<TopBanner userName="Jamie Ruiz" />)
    expect(screen.getByText('Jamie Ruiz')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClinsyncLogo } from '@/components/ClinsyncLogo'

describe('ClinsyncLogo', () => {
  it('renders the Clinsync name as a text wordmark, not an icon-only mark', () => {
    render(<ClinsyncLogo />)
    expect(screen.getByText('Clinsync')).toBeInTheDocument()
  })
})

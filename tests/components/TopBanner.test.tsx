import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBanner } from '@/components/TopBanner'

describe('TopBanner', () => {
  it('always shows the pilot/demo watermark', () => {
    render(<TopBanner environment="pilot" userName="Jamie Ruiz" />)
    expect(screen.getByText(/PILOT.*DEMO.*NO REAL PATIENT DATA/i)).toBeInTheDocument()
  })
  it('shows the signed-in user name', () => {
    render(<TopBanner environment="pilot" userName="Jamie Ruiz" />)
    expect(screen.getByText('Jamie Ruiz')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBanner } from '@/components/TopBanner'

describe('TopBanner', () => {
  it('always shows the pilot/demo watermark', () => {
    render(<TopBanner environment="pilot" intakeqConnected tebraConnected userName="Jamie Ruiz" />)
    expect(screen.getByText(/PILOT.*DEMO.*NO REAL PATIENT DATA/i)).toBeInTheDocument()
  })
  it('shows connection health for both IntakeQ and Tebra', () => {
    render(<TopBanner environment="pilot" intakeqConnected tebraConnected={false} userName="Jamie Ruiz" />)
    expect(screen.getByText('IntakeQ')).toBeInTheDocument()
    expect(screen.getByText('Tebra')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBanner } from '@/components/TopBanner'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

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

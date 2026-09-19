import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBanner } from '@/components/TopBanner'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('TopBanner', () => {
  // The logo/product name moved into LeftNav so the whole app shell reads
  // as "logo in the sidebar", matching the pattern requested for the
  // patient portal too -- TopBanner is now identity/actions only (search,
  // notifications, signed-in user, sign out).
  it('shows the signed-in user name', () => {
    render(<TopBanner userName="Jamie Ruiz" />)
    expect(screen.getByText('Jamie Ruiz')).toBeInTheDocument()
  })
})

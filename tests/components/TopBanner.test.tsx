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
    render(<TopBanner userName="Jamie Ruiz" role="crc" />)
    expect(screen.getByText('Jamie Ruiz')).toBeInTheDocument()
  })

  // The notification bell is the practice-wide audit feed (patient IDs
  // included): admin/crc only, not rendered at all for a PI.
  it('does not render the notification panel for a PI', () => {
    render(<TopBanner userName="Dr. Test" role="pi" />)
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull()
  })
  it.each(['crc', 'admin'] as const)('renders the notification panel for %s', (role) => {
    render(<TopBanner userName="X" role={role} />)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})

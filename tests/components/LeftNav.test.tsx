import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeftNav } from '@/components/LeftNav'

vi.mock('next/navigation', () => ({ usePathname: () => '/patients' }))

describe('LeftNav', () => {
  it('renders the Clinsync wordmark instead of any logo image', () => {
    render(<LeftNav role="admin" />)
    expect(screen.getByText('Clinsync')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('gives the active nav link a filled rounded-full pill background, not a left border bar', () => {
    render(<LeftNav role="admin" />)
    const activeLink = screen.getByRole('link', { name: /patients/i, current: 'page' })
    expect(activeLink.className).toMatch(/rounded-md/)
    expect(activeLink.className).not.toMatch(/border-l-2/)
  })

  it('shows Check-In and Assignments for frontdesk, but hides admin/crc-only items', () => {
    render(<LeftNav role="frontdesk" />)
    expect(screen.getByRole('link', { name: /check-in/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /assignments/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /workbook/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /form templates/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /consent documents/i })).not.toBeInTheDocument()
  })

  it('hides non-clinical Admin menus from a pi', () => {
    render(<LeftNav role="pi" />)
    expect(screen.getByRole('link', { name: /my patients/i })).toBeInTheDocument()
    // ^documents$ -- "Consent Documents" is deliberately visible to a pi (see below).
    for (const hidden of [/identity matching/i, /reports/i, /^documents$/i, /broadcasts/i, /experience surveys/i, /pipeline dashboard/i]) {
      expect(screen.queryByRole('link', { name: hidden })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /billing/i })).not.toBeInTheDocument()
  })

  it('shows the forms hub (Form Templates and Consent Documents) to admin, crc and pi', () => {
    for (const role of ['admin', 'crc', 'pi'] as const) {
      const { unmount } = render(<LeftNav role={role} />)
      expect(screen.getByRole('link', { name: /form templates/i })).toHaveAttribute('href', '/forms')
      expect(screen.getByRole('link', { name: /consent documents/i })).toHaveAttribute('href', '/consent-documents')
      unmount()
    }
  })

  it('hides the forms hub from billing, pharmacy and labs', () => {
    for (const role of ['billing', 'pharmacy', 'labs'] as const) {
      const { unmount } = render(<LeftNav role={role} />)
      expect(screen.queryByRole('link', { name: /form templates/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /consent documents/i })).not.toBeInTheDocument()
      unmount()
    }
  })
})

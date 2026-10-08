import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Every client component that calls an API route must (a) show the route's
// own error message (or a sensible fallback) when the call fails, (b) show a
// message instead of hanging or throwing on a network failure, and (c) not
// crash on a non-JSON error body.

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockClear()
  refresh.mockClear()
})

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const stub = (impl: () => Promise<Response>) => { const f = vi.fn(impl); vi.stubGlobal('fetch', f); return f }
const networkDown = () => stub(async () => { throw new TypeError('Failed to fetch') })

describe('GlobalSearch', () => {
  it('does not crash when the search route answers with an error object', async () => {
    stub(async () => jsonResponse(401, { error: 'Unauthorized' }))
    const { GlobalSearch } = await import('@/components/GlobalSearch')
    render(<GlobalSearch />)
    fireEvent.change(screen.getByLabelText('Global search'), { target: { value: 'mar' } })
    expect(await screen.findByText(/Search is unavailable/i, {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('does not crash on a network failure', async () => {
    networkDown()
    const { GlobalSearch } = await import('@/components/GlobalSearch')
    render(<GlobalSearch />)
    fireEvent.change(screen.getByLabelText('Global search'), { target: { value: 'mar' } })
    expect(await screen.findByText(/Search is unavailable/i, {}, { timeout: 2000 })).toBeInTheDocument()
  })
})

describe('DiscrepancyList', () => {
  it('shows the error and does not reload the page when resolving fails', async () => {
    stub(async () => jsonResponse(403, { error: 'Forbidden' }))
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const { DiscrepancyList } = await import('@/components/DiscrepancyList')
    render(<DiscrepancyList canResolve discrepancies={[{ id: 1, questionLabel: 'Q', patientAnswer: 'a', chartFinding: 'b', resolved: false, resolvedBy: null, createdAt: '2026-01-01' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /mark resolved/i }))
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /mark resolved/i })).toBeEnabled()
  })
})

describe('AutoClassifyToggle', () => {
  it('reports a failed save instead of silently staying put', async () => {
    stub(async () => jsonResponse(500, { error: 'Could not save the setting' }))
    const { AutoClassifyToggle } = await import('@/components/AutoClassifyToggle')
    render(<AutoClassifyToggle initialEnabled={false} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(await screen.findByText('Could not save the setting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Off' })).toBeEnabled()
  })
})

describe('CreateFormButton', () => {
  it('reports a failed create instead of doing nothing', async () => {
    networkDown()
    const { CreateFormButton } = await import('@/components/CreateFormButton')
    render(<CreateFormButton category="Intake" />)
    fireEvent.click(screen.getByRole('button', { name: /create new form/i }))
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('MarkProcessedButton', () => {
  it('handles a non-JSON 500 without throwing', async () => {
    stub(async () => new Response('<html>Internal Server Error</html>', { status: 500 }))
    const { MarkProcessedButton } = await import('@/components/MarkProcessedButton')
    render(<MarkProcessedButton documentId={1} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /mark processed/i }))
    expect(await screen.findByText('Could not mark this document processed.')).toBeInTheDocument()
  })

  it('recovers from a network failure', async () => {
    networkDown()
    const { MarkProcessedButton } = await import('@/components/MarkProcessedButton')
    render(<MarkProcessedButton documentId={1} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /mark processed/i }))
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark processed/i })).toBeEnabled()
  })
})

describe('PracticeInfoForm', () => {
  it('shows the server validation message', async () => {
    stub(async () => jsonResponse(400, { error: 'Invalid practice info' }))
    const { PracticeInfoForm } = await import('@/components/PracticeInfoForm')
    render(<PracticeInfoForm initial={{ practiceName: '', practiceSite: '', practiceTimezone: 'America/Los_Angeles' }} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Invalid practice info')).toBeInTheDocument()
  })
})

describe('StaffManagementPanel', () => {
  it('reports a failed MFA reset instead of silently refreshing', async () => {
    stub(async () => jsonResponse(404, { error: 'User not found' }))
    const { StaffManagementPanel } = await import('@/components/settings/StaffManagementPanel')
    render(<StaffManagementPanel isAdmin staff={[{ id: 5, name: 'Pat CRC', email: 'p@example.com', role: 'crc', mfaEnabled: true }]} />)
    fireEvent.click(screen.getByRole('button', { name: /reset mfa/i }))
    expect(await screen.findByText('User not found')).toBeInTheDocument()
    await waitFor(() => expect(refresh).not.toHaveBeenCalled())
  })
})

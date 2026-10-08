import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EhrConnectionsForm } from '@/components/EhrConnectionsForm'

afterEach(() => {
  vi.unstubAllGlobals()
})

const CONFIGURED = { intakeqConfigured: true, tebraConfigured: true }

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('EhrConnectionsForm', () => {
  it('hides Test connection / Sync now from non-admins', () => {
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: /test connection/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull()
  })

  it('no longer claims that nothing calls the APIs', () => {
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin />)
    expect(screen.queryByText(/Nothing in this app calls either API today/i)).toBeNull()
  })

  it('Test connection posts to the test endpoint and shows each vendor result', async () => {
    const fetchMock = stubFetch(200, { intakeq: { ok: true, message: 'Connected' }, tebra: { ok: false, message: 'Tebra rejected the credentials.' } })
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/IntakeQ: Connected/)).toBeInTheDocument()
    expect(screen.getByText(/Tebra: Tebra rejected the credentials\./)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/ehr-connections/test', expect.objectContaining({ method: 'POST' }))
  })

  it('Sync now posts to the sync endpoint and shows the counts', async () => {
    const fetchMock = stubFetch(200, { newPatients: 2, newMatches: 1, refreshedPatients: 5 })
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }))
    expect(await screen.findByText(/2 new patients, 1 new identity match, 5 refreshed/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/ehr-connections/sync', expect.objectContaining({ method: 'POST' }))
  })

  it('Sync now surfaces the server error message', async () => {
    stubFetch(409, { error: 'EHR connections are not configured' })
    render(<EhrConnectionsForm initial={{ intakeqConfigured: false, tebraConfigured: false }} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }))
    expect(await screen.findByText('EHR connections are not configured')).toBeInTheDocument()
  })

  it('blocks a first Tebra save that is missing fields, without calling the API', async () => {
    const fetchMock = stubFetch(200, {})
    render(<EhrConnectionsForm initial={{ intakeqConfigured: false, tebraConfigured: false }} isAdmin />)
    fireEvent.change(screen.getByLabelText(/customer key/i), { target: { value: 'abc123def456' } })
    fireEvent.click(screen.getByRole('button', { name: /save tebra credentials/i }))
    expect(await screen.findByText(/Missing: API user, API password/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags a malformed IntakeQ key inline, without calling the API', async () => {
    const fetchMock = stubFetch(200, {})
    render(<EhrConnectionsForm initial={{ intakeqConfigured: false, tebraConfigured: false }} isAdmin />)
    fireEvent.change(screen.getByLabelText(/IntakeQ API key/i), { target: { value: 'too short' } })
    fireEvent.click(screen.getByRole('button', { name: /save intakeq key/i }))
    expect(await screen.findByText(/IntakeQ API key looks incomplete/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server validation message when a save is rejected', async () => {
    stubFetch(400, { error: 'Tebra needs the customer key, API user and API password together. Missing: API password.', fieldErrors: {} })
    render(<EhrConnectionsForm initial={{ intakeqConfigured: false, tebraConfigured: true }} isAdmin />)
    fireEvent.change(screen.getByLabelText(/API user/i), { target: { value: 'api@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /save tebra credentials/i }))
    expect(await screen.findByText(/Missing: API password\./)).toBeInTheDocument()
  })

  it('reports a network failure on save instead of hanging on Saving…', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin />)
    fireEvent.change(screen.getByLabelText(/IntakeQ API key/i), { target: { value: '0123456789abcdef0123456789abcdef' } })
    fireEvent.click(screen.getByRole('button', { name: /save intakeq key/i }))
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save intakeq key/i })).toBeEnabled()
  })

  it('Test connection surfaces the server error text when the test itself fails', async () => {
    stubFetch(403, { error: 'Forbidden' })
    render(<EhrConnectionsForm initial={CONFIGURED} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/Could not run the connection test: Forbidden/)).toBeInTheDocument()
  })
})

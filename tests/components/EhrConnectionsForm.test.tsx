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
})

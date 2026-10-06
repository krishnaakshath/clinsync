'use client'
import { useState } from 'react'

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${connected ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
      {connected ? 'Connected' : 'Not configured'}
    </span>
  )
}

type ConnectionCheck = { ok: boolean; message: string }
type SyncResult = { newPatients: number; newMatches: number; refreshedPatients: number }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function EhrConnectionsForm({ initial, isAdmin }: {
  initial: { intakeqConfigured: boolean; tebraConfigured: boolean }
  isAdmin: boolean
}) {
  const [intakeqConfigured, setIntakeqConfigured] = useState(initial.intakeqConfigured)
  const [tebraConfigured, setTebraConfigured] = useState(initial.tebraConfigured)
  const [intakeqApiKey, setIntakeqApiKey] = useState('')
  const [tebraCustomerKey, setTebraCustomerKey] = useState('')
  const [tebraUser, setTebraUser] = useState('')
  const [tebraPassword, setTebraPassword] = useState('')
  const [saving, setSaving] = useState<'intakeq' | 'tebra' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ intakeq: ConnectionCheck; tebra: ConnectionCheck } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function testConnections() {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await fetch('/api/settings/ehr-connections/test', { method: 'POST' })
      if (!res.ok) { setError('Could not run the connection test.'); return }
      setTestResult(await res.json())
    } catch {
      setError('Could not run the connection test.')
    } finally {
      setTesting(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const res = await fetch('/api/settings/ehr-connections/sync', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setSyncError(body?.error ?? 'Sync failed.'); return }
      setSyncResult(body)
    } catch {
      setSyncError('Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function save(payload: Record<string, string>, which: 'intakeq' | 'tebra') {
    setSaving(which)
    setError(null)
    const res = await fetch('/api/settings/ehr-connections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(null)
    if (!res.ok) { setError('Could not save these credentials.'); return }
    const body = await res.json()
    setIntakeqConfigured(body.intakeqConfigured)
    setTebraConfigured(body.tebraConfigured)
    if (which === 'intakeq') setIntakeqApiKey('')
    else { setTebraCustomerKey(''); setTebraUser(''); setTebraPassword('') }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Credentials are encrypted at rest and never shown again after saving. Once both IntakeQ and Tebra are connected,
        use <span className="font-medium text-foreground">Test connection</span> to validate them and{' '}
        <span className="font-medium text-foreground">Sync now</span> to pull clients and charts. Sync never changes staff-entered fields.
      </p>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">IntakeQ</h3>
          <StatusPill connected={intakeqConfigured} />
        </div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">API key</label>
        <input
          type="password"
          value={intakeqApiKey}
          onChange={(e) => setIntakeqApiKey(e.target.value)}
          disabled={!isAdmin}
          placeholder={intakeqConfigured ? '•••••••••••••• (leave blank to keep current key)' : 'Paste IntakeQ API key'}
          className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
        />
        {isAdmin && (
          <button
            onClick={() => save({ intakeqApiKey }, 'intakeq')}
            disabled={!intakeqApiKey || saving === 'intakeq'}
            className="mt-3 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving === 'intakeq' ? 'Saving…' : 'Save IntakeQ key'}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Tebra</h3>
          <StatusPill connected={tebraConfigured} />
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Customer key</label>
            <input type="password" value={tebraCustomerKey} onChange={(e) => setTebraCustomerKey(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '•••••••••••••• (leave blank to keep current)' : 'Tebra customer key'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API user</label>
            <input value={tebraUser} onChange={(e) => setTebraUser(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '(leave blank to keep current)' : 'Tebra API username'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API password</label>
            <input type="password" value={tebraPassword} onChange={(e) => setTebraPassword(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '•••••••••••••• (leave blank to keep current)' : 'Tebra API password'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => save({ tebraCustomerKey, tebraUser, tebraPassword }, 'tebra')}
            disabled={(!tebraCustomerKey && !tebraUser && !tebraPassword) || saving === 'tebra'}
            className="mt-3 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving === 'tebra' ? 'Saving…' : 'Save Tebra credentials'}
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={testConnections}
              disabled={testing}
              className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          {testResult && (
            <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
              <li className={testResult.intakeq.ok ? 'text-primary' : 'text-destructive'}>IntakeQ: {testResult.intakeq.message}</li>
              <li className={testResult.tebra.ok ? 'text-primary' : 'text-destructive'}>Tebra: {testResult.tebra.message}</li>
            </ul>
          )}
          {syncResult && (
            <p className="mt-3 text-sm text-foreground" aria-live="polite">
              Sync complete: {plural(syncResult.newPatients, 'new patient', 'new patients')}, {plural(syncResult.newMatches, 'new identity match', 'new identity matches')}, {syncResult.refreshedPatients} refreshed.
            </p>
          )}
          {syncError && <p className="mt-3 text-sm text-destructive" aria-live="polite">{syncError}</p>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

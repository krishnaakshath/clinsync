'use client'
import { useState } from 'react'
import { sendJson } from '@/lib/send-json'
import { validateEhrCredentialsInput, missingTebraFields, type EhrCredentialField } from '@/lib/ehr-credentials'

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EhrCredentialField, string>>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ intakeq: ConnectionCheck; tebra: ConnectionCheck } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function testConnections() {
    setTesting(true)
    setTestResult(null)
    setError(null)
    const res = await sendJson<{ intakeq: ConnectionCheck; tebra: ConnectionCheck }>('/api/settings/ehr-connections/test', { method: 'POST' })
    setTesting(false)
    if (!res.ok) { setError(`Could not run the connection test: ${res.error}`); return }
    setTestResult(res.data)
  }

  async function syncNow() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    const res = await sendJson<SyncResult>('/api/settings/ehr-connections/sync', { method: 'POST', fallbackError: 'Sync failed.' })
    setSyncing(false)
    if (!res.ok) { setSyncError(res.error); return }
    setSyncResult(res.data)
  }

  async function save(payload: Partial<Record<EhrCredentialField, string>>, which: 'intakeq' | 'tebra') {
    setError(null)
    setFieldErrors({})
    // Same rules the API enforces, checked here first so an obvious mistake
    // doesn't cost a round trip. The server stays authoritative (it alone
    // knows which Tebra fields are already stored).
    const checked = validateEhrCredentialsInput(payload)
    if (!checked.ok) {
      // Field problems show under their own input; only a payload-level problem goes in the summary line.
      if (Object.keys(checked.fieldErrors).length > 0) setFieldErrors(checked.fieldErrors)
      else setError(checked.error)
      return
    }
    if (which === 'tebra' && !tebraConfigured) {
      const missing = missingTebraFields({ customerKey: false, user: false, password: false }, checked.value)
      if (missing.length > 0) { setError(`Tebra needs the customer key, API user and API password together. Missing: ${missing.join(', ')}.`); return }
    }

    setSaving(which)
    const res = await sendJson<{ intakeqConfigured: boolean; tebraConfigured: boolean }>('/api/settings/ehr-connections', {
      method: 'PUT',
      body: checked.value,
      fallbackError: 'Could not save these credentials.',
    })
    setSaving(null)
    if (!res.ok) {
      const serverFieldErrors = (res.body as { fieldErrors?: Partial<Record<EhrCredentialField, string>> } | null)?.fieldErrors
      if (serverFieldErrors && Object.keys(serverFieldErrors).length > 0) setFieldErrors(serverFieldErrors)
      else setError(res.error)
      return
    }
    setIntakeqConfigured(res.data.intakeqConfigured)
    setTebraConfigured(res.data.tebraConfigured)
    setTestResult(null)
    if (which === 'intakeq') setIntakeqApiKey('')
    else { setTebraCustomerKey(''); setTebraUser(''); setTebraPassword('') }
  }

  const fieldError = (field: EhrCredentialField) =>
    fieldErrors[field] ? <p id={`${field}-error`} className="mt-1 text-xs text-destructive">{fieldErrors[field]}</p> : null

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
        <label htmlFor="intakeqApiKey" className="mb-1 block text-xs font-medium text-muted-foreground">IntakeQ API key</label>
        <input
          id="intakeqApiKey"
          aria-invalid={!!fieldErrors.intakeqApiKey}
          autoComplete="off"
          type="password"
          value={intakeqApiKey}
          onChange={(e) => setIntakeqApiKey(e.target.value)}
          disabled={!isAdmin}
          placeholder={intakeqConfigured ? '•••••••••••••• (leave blank to keep current key)' : 'Paste IntakeQ API key'}
          className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
        />
        {fieldError('intakeqApiKey')}
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
            <label htmlFor="tebraCustomerKey" className="mb-1 block text-xs font-medium text-muted-foreground">Customer key</label>
            <input id="tebraCustomerKey" aria-invalid={!!fieldErrors.tebraCustomerKey} autoComplete="off" type="password" value={tebraCustomerKey} onChange={(e) => setTebraCustomerKey(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '•••••••••••••• (leave blank to keep current)' : 'Tebra customer key'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
            {fieldError('tebraCustomerKey')}
          </div>
          <div>
            <label htmlFor="tebraUser" className="mb-1 block text-xs font-medium text-muted-foreground">API user</label>
            <input id="tebraUser" aria-invalid={!!fieldErrors.tebraUser} autoComplete="off" value={tebraUser} onChange={(e) => setTebraUser(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '(leave blank to keep current)' : 'Tebra API username'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
            {fieldError('tebraUser')}
          </div>
          <div>
            <label htmlFor="tebraPassword" className="mb-1 block text-xs font-medium text-muted-foreground">API password</label>
            <input id="tebraPassword" aria-invalid={!!fieldErrors.tebraPassword} autoComplete="new-password" type="password" value={tebraPassword} onChange={(e) => setTebraPassword(e.target.value)} disabled={!isAdmin} placeholder={tebraConfigured ? '•••••••••••••• (leave blank to keep current)' : 'Tebra API password'} className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60" />
            {fieldError('tebraPassword')}
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

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

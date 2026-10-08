'use client'
import { useState } from 'react'
import { sendJson } from '@/lib/send-json'

const ID_TYPES = [
  { value: 'drivers_license', label: "Driver's license" },
  { value: 'state_id', label: 'State ID' },
  { value: 'passport', label: 'Passport' },
] as const

// Records that staff checked a government ID (PUT /api/patients/[anonId]/identity,
// admin/crc only). The number is encrypted server-side and never shown again.
export function IdentityVerificationForm({ anonId }: { anonId: string }) {
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]['value']>('drivers_license')
  const [idNumber, setIdNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = idNumber.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    const res = await sendJson(`/api/patients/${encodeURIComponent(anonId)}/identity`, {
      method: 'PUT',
      body: { idType, idNumber: trimmed },
      fallbackError: 'Could not record identity verification.',
    })
    if (!res.ok) { setSaving(false); setError(res.error); return }
    // Full reload: patient detail is served from a Redis-cached query (see
    // RefreshEligibilityButton for the same reasoning).
    window.location.reload()
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="identity-id-type" className="mb-1 block text-xs font-medium text-muted-foreground">ID type</label>
        <select id="identity-id-type" value={idType} onChange={(e) => setIdType(e.target.value as typeof idType)} className="rounded-md border border-border px-2 py-1.5 text-sm">
          {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="identity-id-number" className="mb-1 block text-xs font-medium text-muted-foreground">ID number</label>
        <input id="identity-id-number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoComplete="off" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving || idNumber.trim() === ''}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Mark identity verified'}
      </button>
      {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PatientOption {
  id: string
  name: string
}

interface ProviderOption {
  id: number
  name: string
}

export function NewEventModal({ patients, providers, defaultDate, onClose }: {
  patients: PatientOption[]
  providers: ProviderOption[]
  defaultDate: string
  onClose: () => void
}) {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [visitReason, setVisitReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          providerId,
          startsAt: `${date}T${startTime}:00`,
          endsAt: `${date}T${endTime}:00`,
          visitReason,
        }),
      })
      if (res.ok) {
        router.refresh()
        onClose()
        return
      }
      const body = await res.json().catch(() => null)
      setError(body?.error ?? 'Could not schedule the appointment.')
    } catch {
      setError('Could not reach the server. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = Boolean(patientId) && providerId !== '' && Boolean(date) && Boolean(startTime) && Boolean(endTime) && Boolean(visitReason) && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-foreground">New Event</h2>
        <div className="space-y-3">
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">Select a patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
          </select>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">Select a provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" className="w-1/2 rounded-md border border-border px-3 py-2 text-sm" />
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="time" className="w-1/2 rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <input value={visitReason} onChange={(e) => setVisitReason(e.target.value)} placeholder="Visit reason" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function EligibilityCheckModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [payerName, setPayerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ status: string; copayCents: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/front-desk/eligibility-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, payerName }),
    })
    setSubmitting(false)
    if (res.ok) { setResult(await res.json()); router.refresh(); return }
    const body = await res.json().catch(() => null)
    setError(body?.error ?? 'Could not verify eligibility.')
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Verify Insurance Eligibility</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Anonymous #, e.g. RD-0001" aria-label="Patient ID" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Payer name, e.g. Aetna" aria-label="Payer" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          {result && (
            <p className="rounded-md border border-border bg-secondary p-2 text-sm">
              Status: <span className="font-medium capitalize">{result.status.replace('_', ' ')}</span>
              {result.copayCents !== null && <> · Copay: ${(result.copayCents / 100).toFixed(2)}</>}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={submit} disabled={submitting || !patientId || !payerName}>Verify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

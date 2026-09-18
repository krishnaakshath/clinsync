'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RecordSurveyResponseForm({ reviewId }: { reviewId: number }) {
  const router = useRouter()
  const [ratingOverall, setRatingOverall] = useState(5)
  const [ratingFormsClarity, setRatingFormsClarity] = useState(5)
  const [ratingCommunication, setRatingCommunication] = useState(5)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingOverall, ratingFormsClarity, ratingCommunication, comments: comments || undefined }),
    })
    setSaving(false)
    if (res.ok) {
      router.refresh()
    } else {
      const body = await res.json()
      setError(body.error ?? 'Could not record this response.')
    }
  }

  function ratingField(label: string, value: number, onChange: (v: number) => void) {
    return (
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {ratingField('Overall Experience (1-5)', ratingOverall, setRatingOverall)}
      {ratingField('Forms Were Clear (1-5)', ratingFormsClarity, setRatingFormsClarity)}
      {ratingField('Communication Was Easy (1-5)', ratingCommunication, setRatingCommunication)}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
      </div>
      <button onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
        {saving ? 'Saving…' : 'Record Response'}
      </button>
    </div>
  )
}

'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

/**
 * Upload control for one side of the primary insurance card. Only the
 * primary card has upload columns/route support (see the schema comment on
 * `patients` -- secondary intentionally has no card columns), so this is
 * only ever rendered next to a primary card slot. Follows NoteForm's
 * canWrite-gates-the-whole-affordance pattern: a role that can't write gets
 * nothing rendered, not a disabled control.
 */
export function InsuranceCardUpload({ anonId, side, hasImage, canWrite }: { anonId: string; side: 'front' | 'back'; hasImage: boolean; canWrite: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!canWrite) return null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.set('side', side)
    formData.set('file', file)
    const res = await fetch(`/api/patients/${anonId}/insurance-card`, { method: 'POST', body: formData })
    setUploading(false)
    if (res.ok) { router.refresh(); return }
    const body = await res.json().catch(() => null)
    setError(body?.error ?? 'Could not upload this card image.')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
        {uploading ? 'Uploading…' : hasImage ? 'Uploaded' : 'Upload'}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileChange}
          disabled={uploading}
          className="sr-only"
          aria-label={`Upload ${side} of primary insurance card`}
        />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

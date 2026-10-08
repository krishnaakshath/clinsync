'use client'
import { sendJson } from '@/lib/send-json'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateFormButton({ category }: { category: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setCreating(true)
    setError(null)
    const res = await sendJson<{ id: number }>('/api/form-templates', {
      method: 'POST',
      body: { name: 'Untitled Form', category, diagnosisTag: 'General', questions: [] },
      fallbackError: 'Could not create a new form.',
    })
    setCreating(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/forms/${res.data.id}`)
  }

  return (
    <div className="flex flex-col">
    <button onClick={create} disabled={creating} className="rounded-lg border-2 border-dashed border-border p-5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
      + Create New Form
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

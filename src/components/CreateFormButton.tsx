'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateFormButton({ category }: { category: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function create() {
    setCreating(true)
    const res = await fetch('/api/form-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled Form', category, diagnosisTag: 'General', questions: [] }),
    })
    setCreating(false)
    if (res.ok) {
      const created = await res.json()
      router.push(`/forms/${created.id}`)
    }
  }

  return (
    <button onClick={create} disabled={creating} className="rounded-lg border-2 border-dashed border-border p-5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
      + Create New Form
    </button>
  )
}

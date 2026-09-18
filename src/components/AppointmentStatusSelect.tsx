'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppointmentStatus } from '@/lib/queries/appointments'

const STATUS_OPTIONS: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show']

export function AppointmentStatusSelect({ appointmentId, status }: { appointmentId: number; status: AppointmentStatus }) {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)

  async function updateStatus(next: string) {
    setUpdating(true)
    const res = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setUpdating(false)
    if (res.ok) router.refresh()
  }

  return (
    <select
      value={status}
      disabled={updating}
      onChange={(e) => updateStatus(e.target.value)}
      className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', '-')}</option>)}
    </select>
  )
}

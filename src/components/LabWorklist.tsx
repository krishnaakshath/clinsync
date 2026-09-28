'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EnterLabResultModal } from '@/components/EnterLabResultModal'
import type { Role } from '@/lib/auth'

export interface WorklistOrder {
  id: number
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled'
  // Passed straight from the Server Component (listWorklist()) without a
  // JSON round-trip, so these arrive as real Date instances (RSC's Flight
  // protocol serializes Date natively) rather than ISO strings -- unlike
  // components fed by a client-side fetch(), which get JSON strings.
  orderedAt: Date
  collectedAt: Date | null
  patientId: string
  patientName: string
  testId: number
  testName: string
  testCode: string
  orderedByProviderId: number
  orderedByProviderName: string
}

interface LabTestOption {
  id: number
  name: string
  code: string
  defaultUnit: string | null
  referenceRange: string | null
}

// Same dot + plain-text-label convention as StatusChip/AssignmentStatusChip/
// MedStatusPill -- kept local since lab-order status isn't any of those
// components' domain.
const STATUS_CONFIG: Record<WorklistOrder['status'], { label: string; dotClassName: string; textClassName: string }> = {
  ordered: { label: 'Ordered', dotClassName: 'bg-primary', textClassName: 'text-foreground' },
  collected: { label: 'Collected', dotClassName: 'bg-warning', textClassName: 'text-warning' },
  resulted: { label: 'Resulted', dotClassName: 'bg-success', textClassName: 'text-success' },
  cancelled: { label: 'Cancelled', dotClassName: 'bg-muted-foreground', textClassName: 'text-muted-foreground' },
}

function LabStatusPill({ status }: { status: WorklistOrder['status'] }) {
  const { label, dotClassName, textClassName } = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textClassName}`}>
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
      {label}
    </span>
  )
}

interface CancelDraft { id: number; reason: string }
interface RowError { id: number; message: string }

// Hoisted to module scope (not a closure inside LabWorklist) so it isn't
// re-created on every render -- all per-row behavior comes in as props.
function LabRow({
  order,
  showActions,
  canCollect,
  canResultOrCancel,
  busyId,
  rowError,
  cancelFor,
  onMarkCollected,
  onOpenResult,
  onStartCancel,
  onCancelReasonChange,
  onCancelBack,
  onConfirmCancel,
}: {
  order: WorklistOrder
  showActions: boolean
  canCollect: boolean
  canResultOrCancel: boolean
  busyId: number | null
  rowError: RowError | null
  cancelFor: CancelDraft | null
  onMarkCollected: (id: number) => void
  onOpenResult: (order: WorklistOrder) => void
  onStartCancel: (id: number) => void
  onCancelReasonChange: (reason: string) => void
  onCancelBack: () => void
  onConfirmCancel: () => void
}) {
  const o = order
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {o.patientName} <span className="font-normal text-muted-foreground">— {o.testName} ({o.testCode})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Ordered by {o.orderedByProviderName} on {o.orderedAt.toLocaleString()}
            {o.collectedAt && ` · Collected ${o.collectedAt.toLocaleString()}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LabStatusPill status={o.status} />
          {showActions && o.status === 'ordered' && canCollect && (
            <Button size="xs" onClick={() => onMarkCollected(o.id)} disabled={busyId === o.id}>Mark collected</Button>
          )}
          {showActions && o.status === 'collected' && canResultOrCancel && (
            <Button size="xs" onClick={() => onOpenResult(o)} disabled={busyId === o.id}>Enter result</Button>
          )}
          {showActions && (o.status === 'ordered' || o.status === 'collected') && canResultOrCancel && (
            <Button size="xs" variant="destructive" onClick={() => onStartCancel(o.id)} disabled={busyId === o.id}>Cancel</Button>
          )}
        </div>
      </div>
      {cancelFor?.id === o.id && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={cancelFor.reason}
            onChange={(e) => onCancelReasonChange(e.target.value)}
            placeholder="Reason for cancelling (required)"
            aria-label="Cancel reason"
            className="min-w-[12rem] flex-1 rounded-md border border-border px-3 py-1.5 text-sm"
          />
          <Button size="xs" variant="outline" onClick={onCancelBack}>Back</Button>
          <Button size="xs" variant="destructive" onClick={onConfirmCancel} disabled={!cancelFor.reason.trim() || busyId === o.id}>Confirm cancel</Button>
        </div>
      )}
      {rowError?.id === o.id && <p className="mt-2 text-xs text-destructive">{rowError.message}</p>}
    </div>
  )
}

export function LabWorklist({ orders, labTests, role }: { orders: WorklistOrder[]; labTests: LabTestOption[]; role: Role }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<RowError | null>(null)
  const [cancelFor, setCancelFor] = useState<CancelDraft | null>(null)
  const [resultFor, setResultFor] = useState<WorklistOrder | null>(null)

  // Mark collected: admin/pi/frontdesk (spec §8 -- logistics, not a clinical
  // judgment). Enter result / cancel: admin/pi only.
  const canCollect = ['admin', 'pi', 'frontdesk'].includes(role)
  const canResultOrCancel = ['admin', 'pi'].includes(role)

  const ordered = orders.filter((o) => o.status === 'ordered')
  const collected = orders.filter((o) => o.status === 'collected')
  const resulted = orders.filter((o) => o.status === 'resulted')
  const cancelled = orders.filter((o) => o.status === 'cancelled')

  async function markCollected(id: number) {
    setBusyId(id)
    setRowError(null)
    const res = await fetch(`/api/lab-orders/${id}/collect`, { method: 'POST' })
    setBusyId(null)
    if (res.ok) { router.refresh(); return }
    const body = await res.json().catch(() => null)
    setRowError({ id, message: body?.error ?? 'Could not mark this order collected.' })
  }

  async function confirmCancel() {
    if (!cancelFor || !cancelFor.reason.trim()) return
    const id = cancelFor.id
    setBusyId(id)
    setRowError(null)
    const res = await fetch(`/api/lab-orders/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelFor.reason }),
    })
    setBusyId(null)
    if (res.ok) { setCancelFor(null); router.refresh(); return }
    const body = await res.json().catch(() => null)
    setRowError({ id, message: body?.error ?? 'Could not cancel this order.' })
  }

  function testDefaults(testId: number) {
    return labTests.find((t) => t.id === testId) ?? null
  }

  const rowProps = {
    canCollect,
    canResultOrCancel,
    busyId,
    rowError,
    cancelFor,
    onMarkCollected: markCollected,
    onOpenResult: setResultFor,
    onStartCancel: (id: number) => setCancelFor({ id, reason: '' }),
    onCancelReasonChange: (reason: string) => setCancelFor((prev) => (prev ? { ...prev, reason } : prev)),
    onCancelBack: () => setCancelFor(null),
    onConfirmCancel: confirmCancel,
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordered ({ordered.length})</h2>
        {ordered.length === 0
          ? <p className="text-sm text-muted-foreground">No orders awaiting collection.</p>
          : <div className="space-y-2">{ordered.map((o) => <LabRow key={o.id} order={o} showActions {...rowProps} />)}</div>}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collected ({collected.length})</h2>
        {collected.length === 0
          ? <p className="text-sm text-muted-foreground">No samples awaiting results.</p>
          : <div className="space-y-2">{collected.map((o) => <LabRow key={o.id} order={o} showActions {...rowProps} />)}</div>}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resulted ({resulted.length})</h2>
        {resulted.length === 0
          ? <p className="text-sm text-muted-foreground">No resulted orders yet.</p>
          : <div className="space-y-2">{resulted.map((o) => <LabRow key={o.id} order={o} showActions={false} {...rowProps} />)}</div>}
      </div>

      {cancelled.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium">{cancelled.length} cancelled</summary>
          <div className="mt-2 space-y-2 opacity-60">
            {cancelled.map((o) => <LabRow key={o.id} order={o} showActions={false} {...rowProps} />)}
          </div>
        </details>
      )}

      {resultFor && (
        <EnterLabResultModal
          orderId={resultFor.id}
          testName={resultFor.testName}
          defaultUnit={testDefaults(resultFor.testId)?.defaultUnit ?? null}
          defaultReferenceRange={testDefaults(resultFor.testId)?.referenceRange ?? null}
          onClose={() => setResultFor(null)}
        />
      )}
    </div>
  )
}

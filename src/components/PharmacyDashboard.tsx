'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DispenseMedicationModal } from '@/components/DispenseMedicationModal'
import type { MedicationWithInventory } from '@/lib/queries/medications'

type StockStatus = 'ok' | 'low' | 'out'

// Zero stock is checked as its own branch, not folded into the "below
// threshold" comparison -- a medication with quantityOnHand === 0 must
// always render "out of stock", even if reorderThreshold is also 0 (which
// would make `quantityOnHand <= reorderThreshold` true for the wrong reason).
function stockStatus(quantityOnHand: number, reorderThreshold: number): StockStatus {
  if (quantityOnHand === 0) return 'out'
  if (quantityOnHand <= reorderThreshold) return 'low'
  return 'ok'
}

const STATUS_STYLES: Record<StockStatus, string> = {
  ok: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  low: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  out: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'OK',
  low: 'Low stock',
  out: 'Out of stock',
}

function StockPill({ status }: { status: StockStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PharmacyDashboard({ medications, canDispense }: { medications: MedicationWithInventory[]; canDispense: boolean }) {
  const [dispensing, setDispensing] = useState<MedicationWithInventory | null>(null)

  return (
    <div className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
      {medications.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No medications on file.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left">
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medication</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On hand</th>
                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                {canDispense && <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {medications.map((m, i) => {
                const status = stockStatus(m.quantityOnHand, m.reorderThreshold)
                return (
                  <tr key={m.id} className={`border-b border-border last:border-b-0 ${i % 2 === 1 ? 'bg-muted/40' : ''} transition-colors hover:bg-secondary`}>
                    <td className="p-3">
                      <p className="font-medium text-foreground">{m.name}</p>
                      {m.genericName && <p className="text-xs text-muted-foreground">{m.genericName}</p>}
                      {m.commonDose && <p className="text-xs text-muted-foreground">{m.commonDose}</p>}
                    </td>
                    <td className="p-3 text-foreground">{m.medicationClass}</td>
                    <td className="p-3 text-foreground">{m.quantityOnHand} {m.unit}</td>
                    <td className="p-3"><StockPill status={status} /></td>
                    {canDispense && (
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setDispensing(m)}>Dispense</Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {dispensing && (
        <DispenseMedicationModal medication={dispensing} onClose={() => setDispensing(null)} />
      )}
    </div>
  )
}

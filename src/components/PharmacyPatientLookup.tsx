'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DispenseMedicationModal } from '@/components/DispenseMedicationModal'
import { LogDispenseBillModal } from '@/components/LogDispenseBillModal'
import { CHARGE_STATUS_LABELS } from '@/lib/charge-status'
import type { MedicationWithInventory } from '@/lib/queries/medications'
import type { PharmacyPatientView, PharmacyEpisode } from '@/lib/queries/patients'

// The view arrives via `fetch().json()`, not as a Server Component prop, so
// `dispensedAt` (typed `Date` on the server-side PharmacyPatientView) is
// really a JSON-serialized string by the time it lands here.
type PharmacyDispense = Omit<PharmacyPatientView['dispenses'][number], 'dispensedAt'> & { dispensedAt: string }
type PharmacyPatientViewClient = Omit<PharmacyPatientView, 'dispenses'> & { dispenses: PharmacyDispense[] }

function EpisodeTable({ episodes, medicationById, onDispense }: {
  episodes: PharmacyEpisode[]
  medicationById: Map<number, MedicationWithInventory>
  onDispense?: (medication: MedicationWithInventory, episode: PharmacyEpisode) => void
}) {
  if (episodes.length === 0) return <p className="text-sm text-muted-foreground">None on file.</p>

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medication</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dose</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start date</th>
            {onDispense && <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {episodes.map((e) => {
            const catalogMed = e.catalogMedicationId !== null ? medicationById.get(e.catalogMedicationId) : undefined
            return (
              <tr key={e.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium text-foreground">{e.name}</td>
                <td className="p-3 text-foreground">{e.medicationClass}</td>
                <td className="p-3 text-foreground">{e.dose ?? '—'}</td>
                <td className="p-3 text-foreground">{e.startDate}</td>
                {onDispense && (
                  <td className="p-3">
                    {e.catalogMedicationId === null || !catalogMed ? (
                      <Badge variant="outline">Not stocked</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onDispense(catalogMed, e)}>Dispense</Button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PharmacyPatientLookup({ medications }: { medications: MedicationWithInventory[] }) {
  const [patientId, setPatientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<PharmacyPatientViewClient | null>(null)
  const [dispensingEpisode, setDispensingEpisode] = useState<{ medication: MedicationWithInventory; episode: PharmacyEpisode } | null>(null)
  const [billingDispense, setBillingDispense] = useState<PharmacyDispense | null>(null)

  const medicationById = new Map(medications.map((m) => [m.id, m]))

  async function lookup() {
    const id = patientId.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    setView(null)
    const res = await fetch(`/api/pharmacy/patients/${encodeURIComponent(id)}`)
    setLoading(false)
    if (res.ok) {
      setView(await res.json())
      return
    }
    const body = await res.json().catch(() => null)
    if (res.status === 404) { setError(body?.error ?? 'No patient with that ID'); return }
    if (res.status === 403) { setError(body?.error ?? 'You do not have permission to look up this patient.'); return }
    setError(body?.error ?? 'Could not look up this patient.')
  }

  // Re-fetches the same chart after a dispense or a bill is logged, so the
  // dispense history / charge cells reflect the write without a full page
  // reload (this component owns its own state -- `router.refresh()` alone
  // wouldn't re-run this component's own `fetch`).
  async function refreshLookup() {
    if (!view) return
    const res = await fetch(`/api/pharmacy/patients/${encodeURIComponent(view.id)}`)
    if (res.ok) setView(await res.json())
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="pharmacy-lookup-id" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient ID</label>
          <input
            id="pharmacy-lookup-id"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lookup() }}
            placeholder="Anonymous #, e.g. RD-0001"
            aria-label="Patient ID"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={lookup} disabled={!patientId.trim() || loading}>{loading ? 'Looking up…' : 'Look up'}</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {view && (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium text-foreground">{view.name}</p></div>
              <div><p className="text-xs text-muted-foreground">DOB</p><p className="font-medium text-foreground">{view.dob}</p></div>
              <div><p className="text-xs text-muted-foreground">Patient ID</p><p className="font-medium text-foreground">{view.id}</p></div>
              <div><p className="text-xs text-muted-foreground">Current provider</p><p className="font-medium text-foreground">{view.currentProvider ?? '—'}</p></div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active medications</h2>
            <EpisodeTable
              episodes={view.activeMedications}
              medicationById={medicationById}
              onDispense={(medication, episode) => setDispensingEpisode({ medication, episode })}
            />
          </Card>

          <details className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Past medications ({view.pastMedications.length})
            </summary>
            <div className="mt-3">
              <EpisodeTable episodes={view.pastMedications} medicationById={medicationById} />
            </div>
          </details>

          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dispense history</h2>
            {view.dispenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dispenses on file.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-left">
                      <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medication</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dispensed by</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.dispenses.map((d) => (
                      <tr key={d.id} className="border-b border-border last:border-b-0">
                        <td className="p-3 font-medium text-foreground">{d.medicationName}</td>
                        <td className="p-3 text-foreground">{d.quantity}</td>
                        <td className="p-3 text-foreground">{d.dispensedByName}</td>
                        <td className="p-3 text-foreground">{new Date(d.dispensedAt).toLocaleString()}</td>
                        <td className="p-3">
                          {d.charge === null ? (
                            <Button size="sm" variant="outline" onClick={() => setBillingDispense(d)}>Log bill</Button>
                          ) : (
                            <span className="text-foreground">{CHARGE_STATUS_LABELS[d.charge.status]} · ${(d.charge.amountCents / 100).toFixed(2)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {dispensingEpisode && view && (
        <DispenseMedicationModal
          medication={dispensingEpisode.medication}
          initialPatientId={view.id}
          medicationEpisodeId={dispensingEpisode.episode.id}
          onClose={() => setDispensingEpisode(null)}
          onDispensed={refreshLookup}
        />
      )}

      {billingDispense && view && (
        <LogDispenseBillModal
          dispense={billingDispense}
          diagnoses={view.diagnoses}
          onClose={() => setBillingDispense(null)}
          onLogged={refreshLookup}
        />
      )}
    </div>
  )
}

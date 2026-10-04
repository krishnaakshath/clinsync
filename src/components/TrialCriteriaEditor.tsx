'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CodeRow { code: string; description: string }
interface ScaleRow { name: string; description: string }
interface MedRow { className: string; washoutDays: number; rule: string; ruleType: 'washout_exclusion' | 'required_stable' }

export interface TrialCriteria {
  ageMin: number
  ageMax: number
  diagnosisCodes: CodeRow[]
  ratingScales: ScaleRow[]
  minRatingScaleScore: number | null
  exclusionDiagnoses: CodeRow[]
  medicationClasses: MedRow[]
}

const INPUT = 'rounded-md border border-border px-2 py-1.5 text-sm'
const SECTION_H = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export function validateCriteria(c: TrialCriteria): string | null {
  if (!Number.isInteger(c.ageMin) || c.ageMin < 1) return 'Minimum age must be a whole number of at least 1.'
  if (!Number.isInteger(c.ageMax) || c.ageMax < c.ageMin) return 'Maximum age must be a whole number greater than or equal to the minimum age.'
  if (c.minRatingScaleScore !== null && (!Number.isInteger(c.minRatingScaleScore) || c.minRatingScaleScore < 1)) {
    return 'Minimum rating scale score must be a whole number of at least 1, or left blank.'
  }
  if ([...c.diagnosisCodes, ...c.exclusionDiagnoses].some((d) => !d.code.trim() || !d.description.trim())) return 'Every diagnosis needs a code and a description.'
  if (c.ratingScales.some((r) => !r.name.trim() || !r.description.trim())) return 'Every rating scale needs a name and a description.'
  if (c.medicationClasses.some((m) => !m.className.trim() || !m.rule.trim())) return 'Every medication class needs a name and a rule.'
  if (c.medicationClasses.some((m) => !Number.isFinite(m.washoutDays) || m.washoutDays < 0)) return 'Washout days must be zero or more.'
  return null
}

export function TrialCriteriaEditor({ trialId, initial }: { trialId: string; initial: TrialCriteria }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TrialCriteria>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setForm(initial)
    setError(null)
    setOpen(true)
  }

  function patchRow<K extends 'diagnosisCodes' | 'ratingScales' | 'exclusionDiagnoses' | 'medicationClasses'>(key: K, i: number, patch: Partial<TrialCriteria[K][number]>) {
    setForm((f) => ({ ...f, [key]: (f[key] as object[]).map((row, idx) => (idx === i ? { ...row, ...patch } : row)) }))
  }
  function removeRow(key: 'diagnosisCodes' | 'ratingScales' | 'exclusionDiagnoses' | 'medicationClasses', i: number) {
    setForm((f) => ({ ...f, [key]: (f[key] as object[]).filter((_, idx) => idx !== i) }))
  }
  function addRow(key: 'diagnosisCodes' | 'ratingScales' | 'exclusionDiagnoses' | 'medicationClasses') {
    const blank = {
      diagnosisCodes: { code: '', description: '' },
      exclusionDiagnoses: { code: '', description: '' },
      ratingScales: { name: '', description: '' },
      medicationClasses: { className: '', washoutDays: 14, rule: '', ruleType: 'washout_exclusion' as const },
    }[key]
    setForm((f) => ({ ...f, [key]: [...(f[key] as object[]), blank] }))
  }

  async function save() {
    const problem = validateCriteria(form)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/trials/${encodeURIComponent(trialId)}/criteria`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ageMin: form.ageMin,
          ageMax: form.ageMax,
          diagnosisCodes: form.diagnosisCodes,
          ratingScales: form.ratingScales,
          minRatingScaleScore: form.minRatingScaleScore,
          exclusionDiagnoses: form.exclusionDiagnoses,
          medicationClasses: form.medicationClasses,
        }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Failed to save criteria (${res.status}).`)
      }
    } catch {
      setError('Network error — criteria were not saved.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={openModal} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
        Edit criteria
      </button>
    )
  }

  const codeSection = (key: 'diagnosisCodes' | 'exclusionDiagnoses', title: string, label: string) => (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className={SECTION_H}>{title}</h3>
        <button type="button" onClick={() => addRow(key)} aria-label={`Add ${label}`} className="text-xs font-medium text-primary hover:underline">+ Add</button>
      </div>
      <div className="space-y-2">
        {form[key].map((row, i) => (
          <div key={i} className="flex gap-2">
            <input value={row.code} onChange={(e) => patchRow(key, i, { code: e.target.value })} aria-label={`${label} code ${i + 1}`} placeholder="Code (e.g. F33.1)" className={`w-32 ${INPUT}`} />
            <input value={row.description} onChange={(e) => patchRow(key, i, { description: e.target.value })} aria-label={`${label} description ${i + 1}`} placeholder="Description" className={`flex-1 ${INPUT}`} />
            <button type="button" onClick={() => removeRow(key, i)} aria-label={`Remove ${label} ${i + 1}`} className="rounded px-2 text-xs text-destructive hover:bg-secondary">Remove</button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/20 p-4">
      <div role="dialog" aria-modal="true" aria-label="Edit eligibility criteria" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-foreground">Edit eligibility criteria</h2>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-destructive">{error}</p>}

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="criteria-age-min" className="mb-1 block text-xs font-medium text-muted-foreground">Minimum age</label>
            <input id="criteria-age-min" type="number" min={1} value={Number.isNaN(form.ageMin) ? '' : form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value === '' ? NaN : Number(e.target.value) })} aria-label="Minimum age" className={`w-full ${INPUT}`} />
          </div>
          <div>
            <label htmlFor="criteria-age-max" className="mb-1 block text-xs font-medium text-muted-foreground">Maximum age</label>
            <input id="criteria-age-max" type="number" min={1} value={Number.isNaN(form.ageMax) ? '' : form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value === '' ? NaN : Number(e.target.value) })} aria-label="Maximum age" className={`w-full ${INPUT}`} />
          </div>
          <div>
            <label htmlFor="criteria-min-score" className="mb-1 block text-xs font-medium text-muted-foreground">Min rating scale score (optional)</label>
            <input id="criteria-min-score" type="number" min={1} value={form.minRatingScaleScore ?? ''} onChange={(e) => setForm({ ...form, minRatingScaleScore: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Minimum rating scale score" className={`w-full ${INPUT}`} />
          </div>
        </div>

        {codeSection('diagnosisCodes', 'Diagnosis Codes', 'diagnosis')}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className={SECTION_H}>Rating Scales</h3>
            <button type="button" onClick={() => addRow('ratingScales')} aria-label="Add rating scale" className="text-xs font-medium text-primary hover:underline">+ Add</button>
          </div>
          <div className="space-y-2">
            {form.ratingScales.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input value={row.name} onChange={(e) => patchRow('ratingScales', i, { name: e.target.value })} aria-label={`Rating scale name ${i + 1}`} placeholder="Name (e.g. MADRS)" className={`w-32 ${INPUT}`} />
                <input value={row.description} onChange={(e) => patchRow('ratingScales', i, { description: e.target.value })} aria-label={`Rating scale description ${i + 1}`} placeholder="Description" className={`flex-1 ${INPUT}`} />
                <button type="button" onClick={() => removeRow('ratingScales', i)} aria-label={`Remove rating scale ${i + 1}`} className="rounded px-2 text-xs text-destructive hover:bg-secondary">Remove</button>
              </div>
            ))}
          </div>
        </div>

        {codeSection('exclusionDiagnoses', 'Exclusion Diagnoses', 'exclusion diagnosis')}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className={SECTION_H}>Medication Classes</h3>
            <button type="button" onClick={() => addRow('medicationClasses')} aria-label="Add medication class" className="text-xs font-medium text-primary hover:underline">+ Add</button>
          </div>
          <div className="space-y-2">
            {form.medicationClasses.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input value={row.className} onChange={(e) => patchRow('medicationClasses', i, { className: e.target.value })} aria-label={`Medication class name ${i + 1}`} placeholder="Class" className={`w-32 ${INPUT}`} />
                <input value={row.rule} onChange={(e) => patchRow('medicationClasses', i, { rule: e.target.value })} aria-label={`Medication rule ${i + 1}`} placeholder="Rule" className={`min-w-40 flex-1 ${INPUT}`} />
                <input type="number" min={0} value={Number.isNaN(row.washoutDays) ? '' : row.washoutDays} onChange={(e) => patchRow('medicationClasses', i, { washoutDays: e.target.value === '' ? NaN : Number(e.target.value) })} aria-label={`Medication days ${i + 1}`} className={`w-20 ${INPUT}`} />
                <select value={row.ruleType} onChange={(e) => patchRow('medicationClasses', i, { ruleType: e.target.value as MedRow['ruleType'] })} aria-label={`Medication rule type ${i + 1}`} className={INPUT}>
                  <option value="washout_exclusion">Washout exclusion</option>
                  <option value="required_stable">Required stable</option>
                </select>
                <button type="button" onClick={() => removeRow('medicationClasses', i)} aria-label={`Remove medication class ${i + 1}`} className="rounded px-2 text-xs text-destructive hover:bg-secondary">Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save criteria'}
          </button>
        </div>
      </div>
    </div>
  )
}

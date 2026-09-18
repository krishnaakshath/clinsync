'use client'
import { useState } from 'react'

export interface FilterFieldDef {
  key: string
  label: string
  type: 'text' | 'select' | 'date'
  options?: string[] // required when type === 'select'
}

export interface AppliedFilter {
  fieldKey: string
  operator: 'contains' | 'equals' | 'on' | 'before' | 'after'
  value: string
}

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  availableFields: FilterFieldDef[]
  activeFilters: AppliedFilter[]
  onApply: (filters: AppliedFilter[]) => void
}

function defaultOperatorFor(type: FilterFieldDef['type']): AppliedFilter['operator'] {
  if (type === 'select') return 'equals'
  if (type === 'date') return 'on'
  return 'contains'
}

export function FilterPanel({ open, onClose, availableFields, activeFilters, onApply }: FilterPanelProps) {
  const [draft, setDraft] = useState<AppliedFilter[]>(activeFilters)
  const [fieldQuery, setFieldQuery] = useState('')

  if (!open) return null

  const usedKeys = new Set(draft.map((f) => f.fieldKey))
  const pickableFields = availableFields.filter(
    (f) => !usedKeys.has(f.key) && f.label.toLowerCase().includes(fieldQuery.toLowerCase())
  )

  function addField(field: FilterFieldDef) {
    setDraft([...draft, { fieldKey: field.key, operator: defaultOperatorFor(field.type), value: '' }])
    setFieldQuery('')
  }

  function removeField(fieldKey: string) {
    setDraft(draft.filter((f) => f.fieldKey !== fieldKey))
  }

  function updateValue(fieldKey: string, value: string) {
    setDraft(draft.map((f) => (f.fieldKey === fieldKey ? { ...f, value } : f)))
  }

  function updateOperator(fieldKey: string, operator: AppliedFilter['operator']) {
    setDraft(draft.map((f) => (f.fieldKey === fieldKey ? { ...f, operator } : f)))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" role="dialog" aria-label="Filters">
      <div className="h-full w-96 overflow-y-auto border-l border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="text-sm text-muted-foreground hover:text-foreground">Close</button>
        </div>

        <div className="space-y-3">
          {draft.map((f) => {
            const def = availableFields.find((a) => a.key === f.fieldKey)
            if (!def) return null
            return (
              <div key={f.fieldKey} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{def.label}</span>
                  <button onClick={() => removeField(f.fieldKey)} aria-label={`Remove ${def.label} filter`} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
                </div>
                {def.type === 'date' && (
                  <select value={f.operator} onChange={(e) => updateOperator(f.fieldKey, e.target.value as AppliedFilter['operator'])} className="mb-2 w-full rounded-md border border-border px-2 py-1 text-sm">
                    <option value="on">On</option>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                  </select>
                )}
                {def.type === 'select' ? (
                  <select value={f.value} onChange={(e) => updateValue(f.fieldKey, e.target.value)} className="w-full rounded-md border border-border px-2 py-1 text-sm">
                    <option value="">Select a value</option>
                    {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={def.type === 'date' ? 'date' : 'text'}
                    value={f.value}
                    onChange={(e) => updateValue(f.fieldKey, e.target.value)}
                    className="w-full rounded-md border border-border px-2 py-1 text-sm"
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4">
          <input
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            placeholder="Add a filter"
            className="mb-2 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          {fieldQuery.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
              {pickableFields.length === 0 ? (
                <li className="p-2 text-sm text-muted-foreground">No matching fields.</li>
              ) : (
                pickableFields.map((f) => (
                  <li key={f.key}>
                    <button onClick={() => addField(f)} className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary">{f.label}</button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button
            onClick={() => { onApply(draft.filter((f) => f.value !== '')); onClose() }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

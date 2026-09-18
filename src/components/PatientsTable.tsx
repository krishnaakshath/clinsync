'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { SourceTag } from '@/components/SourceTag'

export interface PatientRow {
  id: string
  overallStatus?: 'green' | 'yellow' | 'red' | null
  nameTebra: string | null
  nameIntakeq: string
  dobTebra: string | null
  dobIntakeq: string
  currentProvider: string | null
  referralType: string | null
  lastCommunication: string | null
}

export function PatientsTable({ patients }: { patients: PatientRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      const name = (p.nameTebra ?? p.nameIntakeq).toLowerCase()
      return name.includes(q) || p.id.toLowerCase().includes(q)
    })
  }, [search, patients])

  return (
    <div>
      <div className="mb-4">
        <div className="relative max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or anon #…"
            aria-label="Search patients"
            className="w-full rounded-lg border border-primary/15 bg-card/80 px-3 py-2 text-sm text-foreground backdrop-blur-sm transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anon #</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">DOB <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referral Type <SourceTag source="intakeq" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Communication <SourceTag source="staff" /></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => (
            <tr key={p.id} className={`group border-b border-border border-l-2 border-l-transparent transition-colors hover:border-l-primary hover:bg-primary/5 ${i % 2 === 1 ? 'bg-muted/40' : ''}`}>
              <td className="p-3"><StatusChip status={p.overallStatus ?? 'yellow'} /></td>
              <td className="p-3"><Link href={`/patients/${p.id}`} className="font-medium text-primary hover:underline">{p.id}</Link></td>
              <td className="p-3 text-foreground">{p.nameTebra ?? p.nameIntakeq}</td>
              <td className="p-3 text-foreground">{p.dobTebra ?? p.dobIntakeq}</td>
              <td className="p-3 text-foreground">{p.currentProvider}</td>
              <td className="p-3 text-foreground">{p.referralType}</td>
              <td className="p-3 text-muted-foreground">{p.lastCommunication ?? '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">No patients match &quot;{search}&quot;.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        {filtered.length} of {patients.length} record{patients.length === 1 ? '' : 's'}{search ? ' shown' : ''}
      </p>
    </div>
  )
}

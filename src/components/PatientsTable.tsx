'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Stethoscope, Calendar, Tag } from 'lucide-react'
import { StatusChip } from '@/components/StatusChip'
import { SourceTag } from '@/components/SourceTag'
import { PatientAvatar } from '@/components/PatientAvatar'

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

const STATUS_BORDER: Record<string, string> = {
  green: 'border-l-success',
  yellow: 'border-l-warning',
  red: 'border-l-destructive',
}

function PatientCard({ patient }: { patient: PatientRow }) {
  const name = patient.nameTebra ?? patient.nameIntakeq
  const dob = patient.dobTebra ?? patient.dobIntakeq
  const borderClass = STATUS_BORDER[patient.overallStatus ?? 'yellow']

  return (
    <Link
      href={`/patients/${patient.id}`}
      className={`group flex flex-col gap-3 rounded-xl border border-primary/10 border-l-4 ${borderClass} bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <PatientAvatar name={name} />
          <div>
            <p className="font-semibold text-foreground group-hover:text-primary">{name}</p>
            <p className="font-mono text-xs text-muted-foreground">{patient.id}</p>
          </div>
        </div>
        <StatusChip status={patient.overallStatus ?? 'yellow'} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{dob}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{patient.currentProvider ?? '—'}</span>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{patient.referralType ?? '—'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-[10px]">
        <SourceTag source="tebra" />
        <span className="text-muted-foreground">Last contact: {patient.lastCommunication ?? '—'}</span>
      </div>
    </Link>
  )
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or anon #…"
            aria-label="Search patients"
            className="w-full rounded-lg border border-primary/15 bg-card/80 py-2 pl-9 pr-3 text-sm text-foreground backdrop-blur-sm transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
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

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No patients match &quot;{search}&quot;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => <PatientCard key={p.id} patient={p} />)}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {filtered.length} of {patients.length} record{patients.length === 1 ? '' : 's'}{search ? ' shown' : ''}
      </p>
    </div>
  )
}

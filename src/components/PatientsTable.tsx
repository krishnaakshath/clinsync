'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, FileText } from 'lucide-react'
import { StatusChip } from '@/components/StatusChip'
import { PatientAvatar } from '@/components/PatientAvatar'

export interface CriteriaSummaryLike {
  inclusionMet: number
  inclusionTotal: number
  exclusionMet: number
  exclusionTotal: number
}

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
  criteriaSummary?: CriteriaSummaryLike
}

function CriteriaReadout({ summary }: { summary?: CriteriaSummaryLike }) {
  if (!summary || (summary.inclusionTotal === 0 && summary.exclusionTotal === 0)) {
    return <span>No screening evidence yet</span>
  }
  return (
    <span>
      <span className="font-medium text-foreground">{summary.inclusionMet}/{summary.inclusionTotal}</span> inclusion
      {summary.exclusionTotal > 0 && (
        <>
          {' · '}
          <span className="font-medium text-foreground">{summary.exclusionMet}/{summary.exclusionTotal}</span> exclusion
        </>
      )}
    </span>
  )
}

// Minimal by design: name + status dominate, everything else is a single
// muted line so the card reads as one clear hierarchy rather than a grid of
// competing icons/labels. The card body navigates to the patient detail page
// via a "stretched link" (an absolutely-positioned Link filling the card) so
// the whole surface is clickable; "Medical Record" is a separate, real
// sibling Link stacked above it (never nested inside another anchor) that
// opens a dedicated page for that one action.
function PatientCard({ patient }: { patient: PatientRow }) {
  const name = patient.nameTebra ?? patient.nameIntakeq
  const dob = patient.dobTebra ?? patient.dobIntakeq

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <Link href={`/patients/${patient.id}`} className="absolute inset-0" aria-label={`View ${name}`}>
        <span className="sr-only">View {name}</span>
      </Link>

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PatientAvatar name={name} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground group-hover:text-primary">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{patient.id} · {dob}</p>
          </div>
        </div>
        <StatusChip status={patient.overallStatus ?? 'yellow'} />
      </div>

      <p className="relative text-xs text-muted-foreground">
        <CriteriaReadout summary={patient.criteriaSummary} />
      </p>

      <div className="relative flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="truncate text-xs text-muted-foreground">{patient.currentProvider ?? 'Unassigned'}</p>
        <Link
          href={`/patients/${patient.id}/medical-record`}
          className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Medical Record
        </Link>
      </div>
    </div>
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
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => <PatientCard key={p.id} patient={p} />)}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {filtered.length} of {patients.length} record{patients.length === 1 ? '' : 's'}{search ? ' shown' : ''}
      </p>
    </div>
  )
}

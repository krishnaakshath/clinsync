'use client'
import { ReportTable, type ReportColumn } from '@/components/ReportTable'
import { StatusChip } from '@/components/StatusChip'
import type { DataGridFilterField } from '@/components/DataGridToolbar'

export interface PatientReportRow {
  id: string
  displayName: string
  dob: string
  currentProvider: string | null
  overallStatus?: 'green' | 'yellow' | 'red'
}

// Wording matches BroadcastWizard's OVERALL_STATUS_OPTIONS (Phase 5) for the
// same verdict values, so a coordinator sees the same status vocabulary
// everywhere in the app.
const FILTER_FIELDS: DataGridFilterField[] = [
  {
    key: 'overallStatus',
    label: 'Status',
    options: [
      { value: 'green', label: 'Meets' },
      { value: 'yellow', label: 'Needs Verification' },
      { value: 'red', label: 'Potential Exclusion' },
    ],
  },
]

const COLUMNS: ReportColumn<PatientReportRow>[] = [
  { key: 'status', label: 'Status', render: (p) => <StatusChip status={p.overallStatus ?? 'yellow'} /> },
  { key: 'id', label: 'Anon #', render: (p) => p.id },
  { key: 'displayName', label: 'Name', render: (p) => p.displayName },
  { key: 'dob', label: 'DOB', render: (p) => p.dob },
  { key: 'provider', label: 'Provider', render: (p) => p.currentProvider ?? '—' },
]

export function PatientsReportTable({ rows }: { rows: PatientReportRow[] }) {
  return (
    <ReportTable
      rows={rows}
      columns={COLUMNS}
      filterFields={FILTER_FIELDS}
      matchesFilters={(p, filters) => !filters.overallStatus || (p.overallStatus ?? 'yellow') === filters.overallStatus}
      searchFields={['displayName', 'id']}
      rowKey={(p) => p.id}
    />
  )
}

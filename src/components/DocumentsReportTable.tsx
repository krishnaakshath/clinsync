'use client'
import { ReportTable, type ReportColumn } from '@/components/ReportTable'
import type { DataGridFilterField } from '@/components/DataGridToolbar'
import { MarkProcessedButton } from '@/components/MarkProcessedButton'

export type DocumentType =
  | 'other' | 'drivers_license' | 'legal_document'
  | 'insurance_card_primary_front' | 'insurance_card_primary_back'
  | 'insurance_card_secondary_front' | 'insurance_card_secondary_back'
  | 'insurance_eob' | 'insurance_authorization' | 'imaging_result'

export interface DocumentReportRow {
  id: number
  name: string
  documentDate: string
  status: 'new' | 'processed'
  receivedFrom: string
  documentType: DocumentType
  patientId: string | null
  patientName: string | null
  patientDob: string | null
  fileType: string
}

// Master only ever creates the first 3 types -- the rest belong to a feature
// built on the other branch sharing this table, but any of them can show up
// here since both branches read the same live documents table.
const LABEL_TEXT: Record<DocumentType, string> = {
  other: 'Other',
  drivers_license: "Driver's License",
  legal_document: 'Legal Document',
  insurance_card_primary_front: 'Insurance Card (Primary, Front)',
  insurance_card_primary_back: 'Insurance Card (Primary, Back)',
  insurance_card_secondary_front: 'Insurance Card (Secondary, Front)',
  insurance_card_secondary_back: 'Insurance Card (Secondary, Back)',
  insurance_eob: 'Insurance EOB',
  insurance_authorization: 'Insurance Authorization',
  imaging_result: 'Imaging Result',
}
const STATUS_TEXT: Record<DocumentReportRow['status'], string> = { new: 'New', processed: 'Processed' }
const STATUS_DOT: Record<DocumentReportRow['status'], string> = { new: 'bg-warning', processed: 'bg-success' }

const FILTER_FIELDS: DataGridFilterField[] = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', options: Object.entries(STATUS_TEXT).map(([value, label]) => ({ value, label })) },
  { key: 'receivedFrom', label: 'Received From' },
  { key: 'documentType', label: 'Label', options: Object.entries(LABEL_TEXT).map(([value, label]) => ({ value, label })) },
  { key: 'fileType', label: 'File Type' },
  { key: 'patientName', label: 'Patient' },
]

const COLUMNS: ReportColumn<DocumentReportRow>[] = [
  { key: 'name', label: 'Name', render: (d) => d.name },
  { key: 'documentDate', label: 'Document Date', render: (d) => d.documentDate },
  {
    key: 'status',
    label: 'Status',
    render: (d) => (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[d.status]}`} aria-hidden="true" />
        {STATUS_TEXT[d.status]}
      </span>
    ),
  },
  { key: 'receivedFrom', label: 'Received From', render: (d) => d.receivedFrom },
  { key: 'documentType', label: 'Label', render: (d) => LABEL_TEXT[d.documentType] ?? d.documentType },
  { key: 'patientName', label: 'Patient', render: (d) => (d.patientName ? `${d.patientName}${d.patientDob ? ` (DOB ${d.patientDob})` : ''}` : '—') },
  { key: 'fileType', label: 'File Type', render: (d) => d.fileType },
  { key: 'actions', label: 'Actions', render: (d) => <MarkProcessedButton documentId={d.id} disabled={d.status === 'processed'} /> },
]

function matchesFilters(row: DocumentReportRow, filters: Record<string, string>): boolean {
  if (filters.name && !row.name.toLowerCase().includes(filters.name.toLowerCase())) return false
  if (filters.status && row.status !== filters.status) return false
  if (filters.receivedFrom && !row.receivedFrom.toLowerCase().includes(filters.receivedFrom.toLowerCase())) return false
  if (filters.documentType && row.documentType !== filters.documentType) return false
  if (filters.fileType && !row.fileType.toLowerCase().includes(filters.fileType.toLowerCase())) return false
  if (filters.patientName && !(row.patientName ?? '').toLowerCase().includes(filters.patientName.toLowerCase())) return false
  return true
}

export function DocumentsReportTable({ rows }: { rows: DocumentReportRow[] }) {
  return (
    <ReportTable
      rows={rows}
      columns={COLUMNS}
      filterFields={FILTER_FIELDS}
      matchesFilters={matchesFilters}
      searchFields={['name', 'receivedFrom']}
      rowKey={(d) => d.id}
    />
  )
}

'use client'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataGridToolbar, type DataGridFilterField } from '@/components/DataGridToolbar'

export interface ReportColumn<Row> {
  key: string
  label: string
  render: (row: Row) => ReactNode
}

// IMPORTANT: `ReportTable` is a Client Component ('use client' above), so
// `columns`/`matchesFilters` (both contain functions) must always be
// constructed INSIDE a Client Component -- never assembled in a Server
// Component page and passed down as props. Next.js's RSC boundary cannot
// serialize a function from a Server Component into a Client Component
// (confirmed live: "Functions cannot be passed directly to Client
// Components"), so every report leaf needs its own small 'use client'
// wrapper (e.g. PatientsReportTable.tsx) that receives plain, serializable
// row data from its Server Component page and builds columns/filterFields/
// matchesFilters itself -- exactly the same two-file split every existing
// table in this app already uses (ChargesTable.tsx + billing/charges/page.tsx,
// PatientStatementsTable.tsx + billing/statements/page.tsx, etc.).
interface ReportTableProps<Row> {
  rows: Row[]
  columns: ReportColumn<Row>[]
  filterFields: DataGridFilterField[]
  /**
   * Every Phase 3 table hand-writes its own bespoke filter predicate against
   * DataGridToolbar's flat `Record<string, string>` filter model (see
   * PatientStatementsTable's "sentAfter"/"sentBefore" pair) rather than a
   * shared generic matcher -- ReportTable follows the same convention:
   * it owns the toolbar wiring, search, pagination, and column visibility,
   * but leaves the actual per-field comparison to the caller, since each
   * report leaf's fields (dates, statuses, free text) need different
   * comparisons. Only called when at least one filter has a non-empty value.
   */
  matchesFilters?: (row: Row, activeFilters: Record<string, string>) => boolean
  searchFields: (keyof Row & string)[]
  rowKey: (row: Row) => string | number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 25

export function ReportTable<Row>({
  rows, columns, filterFields, matchesFilters, searchFields, rowKey, pageSize = DEFAULT_PAGE_SIZE,
}: ReportTableProps<Row>) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(columns.map((c) => c.key))
  const [page, setPage] = useState(0)

  const filteredRows = useMemo(() => {
    const hasActiveFilters = Object.values(activeFilters).some((v) => v)
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (hasActiveFilters && matchesFilters && !matchesFilters(row, activeFilters)) return false
      if (q !== '') {
        const record = row as Record<string, unknown>
        return searchFields.some((key) => String(record[key] ?? '').toLowerCase().includes(q))
      }
      return true
    })
  }, [rows, activeFilters, search, searchFields, matchesFilters])

  const shownColumns = columns.filter((c) => visibleColumnKeys.includes(c.key))
  const start = page * pageSize
  const pageRows = filteredRows.slice(start, start + pageSize)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  return (
    <div>
      <DataGridToolbar
        searchValue={search}
        onSearchChange={(value) => { setPage(0); setSearch(value) }}
        onRefresh={() => router.refresh()}
        filterFields={filterFields}
        activeFilters={activeFilters}
        onFilterChange={(key, value) => { setPage(0); setActiveFilters((prev) => ({ ...prev, [key]: value })) }}
        onClearFilters={() => { setPage(0); setActiveFilters({}) }}
        columns={columns.map((c) => ({ key: c.key, label: c.label }))}
        visibleColumnKeys={visibleColumnKeys}
        onToggleColumn={(key) => setVisibleColumnKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
      />

      {filteredRows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No results found.</p>
      ) : (
        <>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {shownColumns.map((c) => (
                  <th key={c.key} className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={rowKey(row)} className={`border-b border-border ${i % 2 === 1 ? 'bg-muted/40' : ''} hover:bg-secondary`}>
                  {shownColumns.map((c) => (
                    <td key={c.key} className="p-3 text-foreground">{c.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Rows per page: {pageSize} · {start + 1}–{Math.min(start + pageSize, filteredRows.length)} of {filteredRows.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-border px-2 py-1 disabled:opacity-30">Previous</button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-md border border-border px-2 py-1 disabled:opacity-30">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

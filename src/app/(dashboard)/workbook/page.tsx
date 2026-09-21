import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listWorkbookRows } from '@/lib/queries/workbook'
import { WorkbookTable } from '@/components/WorkbookTable'

export default async function WorkbookPage() {
  const session = await requireSessionOrRedirect()
  const rows = await listWorkbookRows()
  await logAudit(session, 'viewed full pre-screening workbook', null)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pre-Screening Workbook</h1>
          <p className="mt-1 text-sm text-muted-foreground">All 30 tracked fields, one row per patient.</p>
        </div>
        <a
          href="/api/workbook/full"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Download Full Workbook
        </a>
      </div>
      <WorkbookTable rows={rows} isAdmin={session.role === 'admin'} />
    </div>
  )
}

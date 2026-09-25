import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFormSubmissions } from '@/lib/queries/form-submissions'
import { ClientFormsTable } from '@/components/ClientFormsTable'

// Same elevated-card treatment ReportTable.tsx and the rest of the app's
// data surfaces already use.
const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm'

export default async function ClientFormsPage({ searchParams }: { searchParams: Promise<{ status?: string; diagnosisTag?: string }> }) {
  const session = await requireSessionOrRedirect()
  const { status, diagnosisTag } = await searchParams
  const submissions = await listFormSubmissions({ status: status as 'sent' | 'partial' | 'completed' | undefined, diagnosisTag })
  await logAudit(session, 'viewed client forms', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Client Forms</h1>
      <div className={SECTION}>
        {submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No records found.</p>
        ) : (
          <ClientFormsTable submissions={submissions} />
        )}
      </div>
    </div>
  )
}

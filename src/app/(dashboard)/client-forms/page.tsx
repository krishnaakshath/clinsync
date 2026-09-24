import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFormSubmissions } from '@/lib/queries/form-submissions'

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
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form</th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnosis Tag</th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent</th>
                  <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <tr key={s.id} className={`border-b border-border last:border-b-0 ${i % 2 === 1 ? 'bg-muted/40' : ''} transition-colors hover:bg-secondary`}>
                    <td className="p-3"><Link href={`/client-forms/${s.id}`} className="font-medium text-primary hover:underline">{s.patientName}</Link></td>
                    <td className="p-3 text-foreground">{s.templateName}</td>
                    <td className="p-3 text-foreground">{s.diagnosisTag}</td>
                    <td className="p-3 text-foreground capitalize">{s.status}</td>
                    <td className="p-3 text-muted-foreground">{new Date(s.sentDate).toLocaleDateString()}</td>
                    <td className="p-3 text-muted-foreground">{s.completedDate ? new Date(s.completedDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

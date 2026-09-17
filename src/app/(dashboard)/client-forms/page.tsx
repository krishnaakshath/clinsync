import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFormSubmissions } from '@/lib/queries/form-submissions'

export default async function ClientFormsPage({ searchParams }: { searchParams: Promise<{ status?: string; diagnosisTag?: string }> }) {
  const session = await requireSessionOrRedirect()
  const { status, diagnosisTag } = await searchParams
  const submissions = await listFormSubmissions({ status: status as 'sent' | 'partial' | 'completed' | undefined, diagnosisTag })
  await logAudit(session, 'viewed client forms', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Client Forms</h1>
      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No records found.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
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
              <tr key={s.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-muted/40' : ''} hover:bg-secondary`}>
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
      )}
    </div>
  )
}

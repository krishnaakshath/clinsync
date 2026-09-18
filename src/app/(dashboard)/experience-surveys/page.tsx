import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listReviews, listSurveyableSubmissions, getAverageExperienceRating } from '@/lib/queries/reviews'
import { SendSurveyButton } from '@/components/SendSurveyButton'

export default async function ExperienceSurveysPage({ searchParams }: { searchParams: Promise<{ status?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string }> }) {
  const session = await requireSessionOrRedirect()
  const sp = await searchParams
  const filters = {
    status: sp.status === 'sent' || sp.status === 'completed' ? (sp.status as 'sent' | 'completed') : undefined,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    sortBy: sp.sortBy === 'ratingOverall' ? ('ratingOverall' as const) : ('sentAt' as const),
    sortDir: sp.sortDir === 'asc' ? ('asc' as const) : ('desc' as const),
  }
  const [reviewsList, surveyable, averageRating] = await Promise.all([
    listReviews(filters),
    listSurveyableSubmissions(),
    getAverageExperienceRating(),
  ])
  await logAudit(session, 'viewed pre-screening experience surveys', null)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pre-Screening Experience Surveys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {averageRating !== null ? `Average rating: ${averageRating.toFixed(1)} / 5 across ${reviewsList.filter((r) => r.status === 'completed').length} responses` : 'No responses recorded yet.'}
          </p>
        </div>
        <SendSurveyButton candidates={surveyable} />
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 text-sm" action="/experience-surveys">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter By</label>
          <select name="status" defaultValue={filters.status ?? ''} className="rounded-md border border-border px-3 py-2">
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</label>
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ''} className="rounded-md border border-border px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</label>
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ''} className="rounded-md border border-border px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort By</label>
          <select name="sortBy" defaultValue={filters.sortBy} className="rounded-md border border-border px-3 py-2">
            <option value="sentAt">Date Sent</option>
            <option value="ratingOverall">Rating</option>
          </select>
        </div>
        <button type="submit" className="rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-secondary">Apply</button>
      </form>

      {reviewsList.length === 0 ? (
        <p className="text-sm text-muted-foreground">No records found.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rating</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent</th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responded</th>
            </tr>
          </thead>
          <tbody>
            {reviewsList.map((r, i) => (
              <tr key={r.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-muted/40' : ''} hover:bg-secondary`}>
                <td className="p-3"><Link href={`/experience-surveys/${r.id}`} className="font-medium text-primary hover:underline">{r.patientName}</Link></td>
                <td className="p-3 text-foreground">{r.templateName}</td>
                <td className="p-3 capitalize text-foreground">{r.status}</td>
                <td className="p-3 text-foreground">{r.ratingOverall ?? '—'}</td>
                <td className="p-3 text-muted-foreground">{new Date(r.sentAt).toLocaleDateString()}</td>
                <td className="p-3 text-muted-foreground">{r.respondedAt ? new Date(r.respondedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

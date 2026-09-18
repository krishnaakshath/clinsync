import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getReview } from '@/lib/queries/reviews'
import { RecordSurveyResponseForm } from '@/components/RecordSurveyResponseForm'

export default async function ExperienceSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect()
  const { id } = await params
  const review = await getReview(Number(id))
  if (!review) notFound()
  await logAudit(session, `viewed pre-screening experience survey ${id}`, review.patientId)

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-foreground">{review.patientName}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{review.templateName} · Sent {new Date(review.sentAt).toLocaleDateString()}</p>

      {review.status === 'completed' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overall</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{review.ratingOverall}/5</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forms Clarity</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{review.ratingFormsClarity}/5</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Communication</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{review.ratingCommunication}/5</p>
            </div>
          </div>
          {review.comments && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
              <p className="mt-1 text-sm text-foreground">{review.comments}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Responded {new Date(review.respondedAt!).toLocaleDateString()}</p>
        </div>
      ) : (
        <RecordSurveyResponseForm reviewId={review.id} />
      )}
    </div>
  )
}

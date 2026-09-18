// Skeleton for the identity matching queue: title + a stacked list of
// comparison cards, each a 2-column grid (Intake Referral vs. Candidate
// Clinical Record) with a full-width action row underneath.
export default function IdentityMatchingLoading() {
  return (
    <div>
      <div className="mb-6 h-7 w-64 animate-pulse rounded-md bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-5">
            <div>
              <div className="mb-2 h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="mb-1 h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div>
              <div className="mb-2 h-3 w-48 animate-pulse rounded bg-muted" />
              <div className="mb-1 h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="col-span-2 flex gap-2">
              <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
              <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

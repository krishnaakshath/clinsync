import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPendingIdentityMatches } from '@/lib/queries/identity-matches'

export default async function IdentityMatchingPage() {
  // Must be the first statement — see the comment in patients/page.tsx for
  // why relying on the layout's redirect() alone isn't sufficient.
  const session = await requireSessionOrRedirect()
  const matches = await listPendingIdentityMatches()
  await logAudit(session, 'viewed identity matching queue', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Identity Matching Queue</h1>
      <div className="space-y-4">
        {matches.map((m) => (
          <div key={m.id} className="grid grid-cols-2 gap-4 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Intake Referral</p>
              <p className="text-sm">{m.referralName}</p>
              <p className="text-xs text-muted-foreground">DOB {m.referralDob}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Candidate Clinical Record ({m.confidence}% confidence)</p>
              <p className="text-sm">{m.candidateName}</p>
              <p className="text-xs text-muted-foreground">DOB {m.candidateDob}</p>
            </div>
            <div className="col-span-2 flex gap-2">
              <form action={`/api/identity-matches/${m.id}/confirm`} method="post">
                <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">Confirm Match</button>
              </form>
              <form action={`/api/identity-matches/${m.id}/reject`} method="post">
                <button type="submit" className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">Reject</button>
              </form>
            </div>
          </div>
        ))}
        {matches.length === 0 && <p className="text-sm text-muted-foreground">No pending matches — all referrals are linked.</p>}
      </div>
    </div>
  )
}

import { getSession } from '@/lib/auth'
import { listPendingIdentityMatches } from '@/lib/queries/identity-matches'

export default async function IdentityMatchingPage() {
  // This page's own (dashboard) layout already redirects an unauthenticated
  // visitor to /login before this component ever renders, so `session` here
  // is always non-null in practice — matching the established convention in
  // src/app/(dashboard)/patients/page.tsx. We don't use it beyond that today
  // (no audit log entry is required for viewing this queue).
  await getSession()
  const matches = await listPendingIdentityMatches()

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Identity Matching Queue</h1>
      <div className="space-y-4">
        {matches.map((m) => (
          <div key={m.id} className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div>
              <p className="text-xs font-semibold uppercase text-blue-700">IntakeQ Referral</p>
              <p className="text-sm">{m.referralName}</p>
              <p className="text-xs text-slate-500">DOB {m.referralDob}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-purple-700">Candidate Tebra Chart ({m.confidence}% confidence)</p>
              <p className="text-sm">{m.candidateName}</p>
              <p className="text-xs text-slate-500">DOB {m.candidateDob}</p>
            </div>
            <div className="col-span-2 flex gap-2">
              <form action={`/api/identity-matches/${m.id}/confirm`} method="post">
                <button type="submit" className="rounded-md bg-green-700 px-3 py-1 text-sm text-white">Confirm Match</button>
              </form>
              <form action={`/api/identity-matches/${m.id}/reject`} method="post">
                <button type="submit" className="rounded-md border px-3 py-1 text-sm">Reject</button>
              </form>
            </div>
          </div>
        ))}
        {matches.length === 0 && <p className="text-sm text-slate-500">No pending matches — all referrals are linked.</p>}
      </div>
    </div>
  )
}

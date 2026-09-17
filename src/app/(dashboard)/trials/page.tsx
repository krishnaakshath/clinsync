import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { listAllTrials } from '@/lib/queries/trials'

export default async function TrialsPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  await requireSessionOrRedirect()
  const trials = await listAllTrials()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Trials & Protocols</h1>
      <div className="space-y-2">
        {trials.map((t) => (
          <Link key={t.id} href={`/trials/${t.id}`} className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
            <p className="text-base font-semibold text-foreground">{t.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.nctNumber} · {t.condition} · {t.site}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

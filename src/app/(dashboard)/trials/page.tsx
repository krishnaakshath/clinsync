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
      <div className="space-y-3">
        {trials.map((t) => (
          <Link key={t.id} href={`/trials/${t.id}`} className="group block rounded-xl border border-primary/10 border-l-2 border-l-transparent bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-l-primary hover:bg-primary/5 hover:shadow-md">
            <p className="text-base font-semibold text-foreground group-hover:text-primary">{t.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.nctNumber} · {t.condition} · {t.site}</p>
          </Link>
        ))}
        {trials.length === 0 && <p className="text-sm text-muted-foreground">No trials found.</p>}
      </div>
    </div>
  )
}

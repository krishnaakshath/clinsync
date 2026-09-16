import Link from 'next/link'
import { listAllTrials } from '@/lib/queries/trials'

export default async function TrialsPage() {
  const trials = await listAllTrials()

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Trials & Protocols</h1>
      <div className="space-y-2">
        {trials.map((t) => (
          <Link key={t.id} href={`/trials/${t.id}`} className="block rounded-lg border p-4 hover:bg-slate-50">
            <p className="font-medium">{t.name}</p>
            <p className="text-sm text-slate-500">{t.nctNumber} · {t.condition} · {t.site}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

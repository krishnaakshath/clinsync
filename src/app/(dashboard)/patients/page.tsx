import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { SourceTag } from '@/components/SourceTag'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAllTrials } from '@/lib/queries/trials'

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ trialId?: string }> }) {
  // Must be the first statement: a final security review proved that relying
  // on the (dashboard) layout's redirect() alone lets this page's full PHI
  // content render and stream into the response body even on an
  // unauthenticated request (the top-level status becomes a redirect, but
  // the body isn't discarded server-side). Checking here, before any data
  // fetch, is what actually stops that.
  const session = await requireSessionOrRedirect()

  const { trialId } = await searchParams
  const [patients, trials] = await Promise.all([listPatientsWithStatus(trialId ?? null), listAllTrials()])
  await logAudit(session, 'viewed patient list', null)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Patients</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            <Link href="/patients" className={`rounded-md px-3 py-1.5 font-medium transition-colors ${!trialId ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>All Trials</Link>
            {trials.map((t) => (
              <Link key={t.id} href={`/patients?trialId=${t.id}`} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${trialId === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t.condition}</Link>
            ))}
          </div>
          <a href="/api/workbook/export" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90">Download Verification Workbook</a>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anon #</th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">DOB <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider <SourceTag source="tebra" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referral Type <SourceTag source="intakeq" /></th>
            <th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Communication <SourceTag source="staff" /></th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p, i) => (
            <tr key={p.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-muted/40' : ''} hover:bg-secondary`}>
              <td className="p-3"><StatusChip status={p.overallStatus ?? 'yellow'} /></td>
              <td className="p-3"><Link href={`/patients/${p.id}`} className="font-medium text-primary hover:underline">{p.id}</Link></td>
              <td className="p-3 text-foreground">{p.nameTebra ?? p.nameIntakeq}</td>
              <td className="p-3 text-foreground">{p.dobTebra ?? p.dobIntakeq}</td>
              <td className="p-3 text-foreground">{p.currentProvider}</td>
              <td className="p-3 text-foreground">{p.referralType}</td>
              <td className="p-3 text-muted-foreground">{p.lastCommunication ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">{patients.length} total record{patients.length === 1 ? '' : 's'}</p>
    </div>
  )
}

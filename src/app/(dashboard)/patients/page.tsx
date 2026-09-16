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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Patients</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/patients" className={`rounded-md border px-3 py-1 ${!trialId ? 'bg-slate-900 text-white' : ''}`}>All Trials</Link>
          {trials.map((t) => (
            <Link key={t.id} href={`/patients?trialId=${t.id}`} className={`rounded-md border px-3 py-1 ${trialId === t.id ? 'bg-slate-900 text-white' : ''}`}>{t.condition}</Link>
          ))}
          <a href="/api/workbook/export" className="rounded-md border px-3 py-1 text-sm">Export to Excel</a>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Status</th>
            <th className="p-2">Anon #</th>
            <th className="p-2">Name <SourceTag source="tebra" /></th>
            <th className="p-2">DOB <SourceTag source="tebra" /></th>
            <th className="p-2">Provider <SourceTag source="tebra" /></th>
            <th className="p-2">Referral Type <SourceTag source="intakeq" /></th>
            <th className="p-2">Last Communication <SourceTag source="staff" /></th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id} className="border-b hover:bg-slate-50">
              <td className="p-2"><StatusChip status={p.overallStatus ?? 'yellow'} /></td>
              <td className="p-2"><Link href={`/patients/${p.id}`} className="text-blue-700 underline">{p.id}</Link></td>
              <td className="p-2">{p.nameTebra ?? p.nameIntakeq}</td>
              <td className="p-2">{p.dobTebra ?? p.dobIntakeq}</td>
              <td className="p-2">{p.currentProvider}</td>
              <td className="p-2">{p.referralType}</td>
              <td className="p-2">{p.lastCommunication ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

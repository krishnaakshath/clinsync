import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { SourceTag } from '@/components/SourceTag'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAllTrials } from '@/lib/queries/trials'

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ trialId?: string }> }) {
  const { trialId } = await searchParams

  // This page's own (dashboard) layout already redirects an unauthenticated
  // visitor to /login before this component ever renders, so `session` here
  // is always non-null in practice — but we still need it to attribute the
  // audit-log entry, matching the same requirement the API route enforces.
  const session = await getSession()
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

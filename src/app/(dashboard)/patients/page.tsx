import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { StatusChip } from '@/components/StatusChip'
import { SourceTag } from '@/components/SourceTag'
import type { trials as trialsTable, patients as patientsTable } from '@/db/schema'
import type { Verdict } from '@/lib/rule-engine'

type Trial = typeof trialsTable.$inferSelect
type PatientRow = typeof patientsTable.$inferSelect & { trialId?: string; overallStatus?: Verdict }

// Server Components run on the server and can't rely on the browser to
// attach the session cookie for us, so internal API calls need it forwarded
// explicitly — otherwise requireSession() in the route handlers rejects the
// request with 401 even though the visiting user is signed in.
async function internalFetch(path: string) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const host = headerStore.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'

  const res = await fetch(`${protocol}://${host}${path}`, {
    cache: 'no-store',
    headers: { Cookie: cookieStore.toString() },
  })
  return res.json()
}

async function getPatients(trialId?: string): Promise<{ patients: PatientRow[] }> {
  const params = new URLSearchParams()
  if (trialId) params.set('trialId', trialId)
  const query = params.toString()
  return internalFetch(`/api/patients${query ? `?${query}` : ''}`)
}

async function getTrials(): Promise<{ trials: Trial[] }> {
  return internalFetch('/api/trials')
}

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ trialId?: string }> }) {
  const { trialId } = await searchParams
  const [{ patients }, { trials }] = await Promise.all([getPatients(trialId), getTrials()])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Patients</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/patients" className={`rounded-md border px-3 py-1 ${!trialId ? 'bg-slate-900 text-white' : ''}`}>All Trials</Link>
          {trials.map((t: Trial) => (
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
          {patients.map((p: PatientRow) => (
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

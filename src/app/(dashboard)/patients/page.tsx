import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAllTrials } from '@/lib/queries/trials'
import { PatientsTable } from '@/components/PatientsTable'
import { AddPatientButton } from '@/components/AddPatientButton'

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
        <h1 className="text-2xl font-bold text-foreground">Patients</h1>
        <div className="flex items-center gap-3">
          <AddPatientButton />
          <a href="/api/workbook/export" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90">Download Verification Workbook</a>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-1 rounded-lg border border-primary/10 bg-card/80 p-1 text-sm backdrop-blur-sm">
        <Link href="/patients" className={`rounded-md px-3 py-1.5 font-medium transition-colors ${!trialId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>All Trials</Link>
        {trials.map((t) => (
          <Link key={t.id} href={`/patients?trialId=${t.id}`} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${trialId === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t.condition}</Link>
        ))}
      </div>

      {/* Project down to only what PatientsTable renders before crossing
          the Server->Client Component boundary -- the full row includes
          clinician notes, both encrypted-ID columns, and every contact
          field from both source systems, none of which this table shows,
          but all of which would otherwise ship into the client bundle. */}
      <PatientsTable patients={patients.map((p) => ({
        id: p.id,
        overallStatus: p.overallStatus,
        nameTebra: p.nameTebra,
        nameIntakeq: p.nameIntakeq,
        dobTebra: p.dobTebra,
        dobIntakeq: p.dobIntakeq,
        currentProvider: p.currentProvider,
        referralType: p.referralType,
        lastCommunication: p.lastCommunication,
      }))} />
    </div>
  )
}

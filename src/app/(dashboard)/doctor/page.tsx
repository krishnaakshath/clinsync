import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { PatientsTable } from '@/components/PatientsTable'

export default async function DoctorPortalPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  if (session.role !== 'pi') redirect('/')

  const patients = await listPatientsWithStatus(null)
  // No real doctor<->patient assignment table exists yet -- currentProvider
  // is free text (see the Design Decision note in seed.ts), and the seeded
  // roster spells the same doctor two different ways ("Dr. R. Kunam" vs
  // "Dr. Rajiv Kunam"). Match on last name so both forms resolve to the
  // same doctor rather than requiring an exact string match.
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const myPatients = patients.filter((p) => (p.currentProvider ?? '').toLowerCase().includes(lastName.toLowerCase()))

  await logAudit(session, 'viewed My Patients (doctor portal)', null)

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">My Patients</h1>
        <p className="text-sm text-muted-foreground">Patients currently assigned to {session.name}.</p>
      </div>

      {/* Project down to only what PatientsTable renders -- see the same
          comment in patients/page.tsx. */}
      <PatientsTable patients={myPatients.map((p) => ({
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

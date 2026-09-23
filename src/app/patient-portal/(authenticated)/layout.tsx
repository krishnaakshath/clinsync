import { notFound } from 'next/navigation'
import { requirePatientSessionOrRedirect } from '@/lib/patient-session'
import { getPatientPortalIdentity } from '@/lib/queries/patient-portal'
import { PatientPortalSideNav } from '@/components/PatientPortalSideNav'
import { PatientPortalTopBar } from '@/components/PatientPortalTopBar'
import { PatientPortalSessionTimeoutWarning } from '@/components/PatientPortalSessionTimeoutWarning'

// Same shell shape as the staff app's (dashboard) layout -- a persistent
// left sidebar (logo + nav) plus a slim top identity bar -- so the
// patient-facing portal reads as the same product instead of a
// separately-designed one.
export default async function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePatientSessionOrRedirect()
  const identity = await getPatientPortalIdentity(session.patientId)
  if (!identity) notFound()

  return (
    // h-screen + overflow-hidden (not min-h-screen), same reasoning as the
    // staff (dashboard) layout: without a height bound here, a tall page
    // scrolls the whole browser window and carries the sidebar away with
    // it instead of leaving it pinned while only the content scrolls.
    <div className="flex h-screen overflow-hidden">
      <PatientPortalSessionTimeoutWarning />
      <PatientPortalSideNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PatientPortalTopBar name={identity.name} dob={identity.dob} patientId={identity.id} />
        <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
      </div>
    </div>
  )
}

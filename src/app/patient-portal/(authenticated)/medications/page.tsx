import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { requirePatientSessionOrRedirect } from '@/lib/patient-session'
import { getPatientPortalData } from '@/lib/queries/patient-portal'
import { logPatientPortalAction } from '@/lib/patient-portal-audit'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm'
const HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function PatientPortalMedicationsPage() {
  const session = await requirePatientSessionOrRedirect()
  const data = await getPatientPortalData(session.patientId)
  if (!data) notFound()

  await logPatientPortalAction('viewed patient portal medications', session.patientId)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Medications</h1>

      <section className={SECTION}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={HEADING}>Current medications</h2>
          <a href="/api/patient-portal/medications-export" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download summary
          </a>
        </div>
        {data.activeMedications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current medications on file.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.activeMedications.map((m) => (
              <li key={m.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-medium">{m.name}</span> ({m.medicationClass}) — {m.dose ?? 'dose not on file'}
                <span className="block text-xs text-muted-foreground">Started {m.startDate}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={HEADING}>Past medications</h2>
        {data.pastMedications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past medications on file.</p>
        ) : (
          <ul className="space-y-2 text-sm text-foreground">
            {data.pastMedications.map((m) => (
              <li key={m.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-medium">{m.name}</span> ({m.medicationClass}) — {m.dose ?? 'dose not on file'}
                <span className="block text-xs text-muted-foreground">{m.startDate} to {m.stopDate ?? 'unknown'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

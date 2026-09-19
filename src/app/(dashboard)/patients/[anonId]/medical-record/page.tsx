import { notFound } from 'next/navigation'
import { BackLink } from '@/components/BackLink'
import { PatientAvatar } from '@/components/PatientAvatar'
import { AllergyBadge } from '@/components/AllergyBadge'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPatientDetail } from '@/lib/queries/patients'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
const SECTION_HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function ComparisonRow({ label, intakeq, tebra, merged }: { label: string; intakeq: string | null; tebra: string | null; merged: string | null }) {
  const mismatch = intakeq && tebra && intakeq !== tebra
  return (
    <div className="grid grid-cols-4 gap-2 border-b border-border py-3 text-sm last:border-b-0">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-foreground">{intakeq ?? '—'}</span>
      <span className="text-foreground">{tebra ?? '—'}</span>
      <span className={mismatch ? 'rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800' : 'text-foreground'}>{merged ?? '—'}</span>
    </div>
  )
}

/**
 * Dedicated, standalone page for a single patient's medical record --
 * carved out of the Patient Detail page's Overview tab so "open the chart"
 * is a real navigation to its own URL rather than a tab buried inside the
 * screening/verification workflow. Reuses getPatientDetail(); it's the same
 * cached data the Overview tab used to render.
 */
export default async function MedicalRecordPage({ params }: { params: Promise<{ anonId: string }> }) {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()

  const { anonId } = await params
  const patient = await getPatientDetail(anonId)
  if (!patient) notFound()
  await logAudit(session, 'viewed patient medical record', anonId)

  const name = patient.nameTebra ?? patient.nameIntakeq

  return (
    <div className="max-w-4xl space-y-6">
      <BackLink href={`/patients/${anonId}`} label="Back to Patient" />

      <div className={`${SECTION} flex items-center gap-4`}>
        <PatientAvatar name={name} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-foreground">{name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{patient.id} · DOB {patient.dobTebra ?? patient.dobIntakeq}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Chart data as of {new Date(patient.chartDataAsOf).toLocaleString()}</p>
        </div>
      </div>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Dual-Sourced Fields</h2>
        <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Field</span><span>Intake Form</span><span>Clinical Record</span><span>Merged (used)</span>
        </div>
        <ComparisonRow label="Name" intakeq={patient.nameIntakeq} tebra={patient.nameTebra} merged={patient.nameTebra ?? patient.nameIntakeq} />
        <ComparisonRow label="DOB" intakeq={patient.dobIntakeq} tebra={patient.dobTebra} merged={patient.dobTebra ?? patient.dobIntakeq} />
        <ComparisonRow label="Email" intakeq={patient.emailIntakeq} tebra={patient.emailTebra} merged={patient.emailTebra ?? patient.emailIntakeq} />
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Diagnoses & Medications</h2>
        {patient.diagnoses.length === 0 && patient.medications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No diagnoses or medications recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground">
            {patient.diagnoses.map((d) => <li key={`dx-${d.id}`}>{d.code} — {d.description}</li>)}
            {patient.medications.map((m) => <li key={`med-${m.id}`}>{m.name} ({m.medicationClass}), {m.dose}, since {m.startDate} — {m.status}</li>)}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Allergies</h2>
        {patient.allergies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No known allergies recorded.</p>
        ) : (
          <div className="space-y-2">
            {patient.allergies.map((a) => <AllergyBadge key={a.id} allergen={a.allergen} reaction={a.reaction} severity={a.severity} />)}
          </div>
        )}
      </section>
    </div>
  )
}

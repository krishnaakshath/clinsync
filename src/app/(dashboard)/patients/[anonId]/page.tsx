import { notFound } from 'next/navigation'
import { StatusChip } from '@/components/StatusChip'
import { EvidenceCard } from '@/components/EvidenceCard'
import { AllergyBadge } from '@/components/AllergyBadge'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPatientDetail } from '@/lib/queries/patients'

function ComparisonRow({ label, intakeq, tebra, merged }: { label: string; intakeq: string | null; tebra: string | null; merged: string | null }) {
  const mismatch = intakeq && tebra && intakeq !== tebra
  return (
    <div className="grid grid-cols-4 gap-2 border-b border-border py-3 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-foreground">{intakeq ?? '—'}</span>
      <span className="text-foreground">{tebra ?? '—'}</span>
      <span className={mismatch ? 'rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800' : 'text-foreground'}>{merged ?? '—'}</span>
    </div>
  )
}

export default async function PatientDetailPage({ params }: { params: Promise<{ anonId: string }> }) {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()

  const { anonId } = await params
  const patient = await getPatientDetail(anonId)
  if (!patient) notFound()
  await logAudit(session, 'viewed patient detail', anonId)

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{patient.id} — {patient.nameTebra ?? patient.nameIntakeq}</h1>
        <StatusChip status={patient.overallStatus ?? 'yellow'} />
      </div>

      <section className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Screening Evidence</h2>
        <div className="space-y-3">
          {patient.criteria.map((c) => <EvidenceCard key={c.id} criterion={c} />)}
        </div>
      </section>

      <section className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dual-Sourced Fields</h2>
        <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Field</span><span>Intake Form</span><span>Clinical Record</span><span>Merged (used)</span>
        </div>
        <ComparisonRow label="Name" intakeq={patient.nameIntakeq} tebra={patient.nameTebra} merged={patient.nameTebra ?? patient.nameIntakeq} />
        <ComparisonRow label="DOB" intakeq={patient.dobIntakeq} tebra={patient.dobTebra} merged={patient.dobTebra ?? patient.dobIntakeq} />
        <ComparisonRow label="Email" intakeq={patient.emailIntakeq} tebra={patient.emailTebra} merged={patient.emailTebra ?? patient.emailIntakeq} />
      </section>

      <section className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnoses & Medications</h2>
        <ul className="space-y-1.5 text-sm text-foreground">
          {patient.diagnoses.map((d) => <li key={d.id}>{d.code} — {d.description}</li>)}
          {patient.medications.map((m) => <li key={m.id}>{m.name} ({m.medicationClass}), {m.dose}, since {m.startDate} — {m.status}</li>)}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allergies</h2>
        {patient.allergies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No known allergies recorded.</p>
        ) : (
          <div className="space-y-2">
            {patient.allergies.map((a) => <AllergyBadge key={a.id} allergen={a.allergen} reaction={a.reaction} severity={a.severity} />)}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md">
        <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity Verification</h2>
        {patient.identityVerification?.verified ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
            <span className="text-foreground">Verified by {patient.identityVerification.verifiedBy} on {new Date(patient.identityVerification.verifiedAt!).toLocaleDateString()}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="text-foreground">Verification pending{patient.identityVerification ? ` (${patient.identityVerification.idType.replace('_', ' ')} on file)` : ' — no ID on file'}</span>
          </div>
        )}
      </section>
    </div>
  )
}

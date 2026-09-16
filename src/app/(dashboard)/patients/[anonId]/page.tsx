import { notFound } from 'next/navigation'
import { StatusChip } from '@/components/StatusChip'
import { EvidenceCard } from '@/components/EvidenceCard'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPatientDetail } from '@/lib/queries/patients'

function ComparisonRow({ label, intakeq, tebra, merged }: { label: string; intakeq: string | null; tebra: string | null; merged: string | null }) {
  const mismatch = intakeq && tebra && intakeq !== tebra
  return (
    <div className="grid grid-cols-4 gap-2 border-b py-2 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <span>{intakeq ?? '—'}</span>
      <span>{tebra ?? '—'}</span>
      <span className={mismatch ? 'rounded bg-amber-100 px-1 font-medium text-amber-800' : ''}>{merged ?? '—'}</span>
    </div>
  )
}

export default async function PatientDetailPage({ params }: { params: Promise<{ anonId: string }> }) {
  const { anonId } = await params

  // This page's own (dashboard) layout already redirects an unauthenticated
  // visitor to /login before this component ever renders, so `session` here
  // is always non-null in practice — but we still need it to attribute the
  // audit-log entry, matching the same requirement the API route enforces.
  const session = await getSession()
  const patient = await getPatientDetail(anonId)
  if (!patient) notFound()
  await logAudit(session, 'viewed patient detail', anonId)

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{patient.id} — {patient.nameTebra ?? patient.nameIntakeq}</h1>
        <StatusChip status={patient.overallStatus ?? 'yellow'} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Screening Evidence</h2>
        <div className="space-y-3">
          {patient.criteria.map((c) => <EvidenceCard key={c.id} criterion={c} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Dual-Sourced Fields</h2>
        <div className="grid grid-cols-4 gap-2 border-b pb-1 text-xs font-semibold text-slate-400">
          <span>Field</span><span>IntakeQ</span><span>Tebra</span><span>Merged (used)</span>
        </div>
        <ComparisonRow label="Name" intakeq={patient.nameIntakeq} tebra={patient.nameTebra} merged={patient.nameTebra ?? patient.nameIntakeq} />
        <ComparisonRow label="DOB" intakeq={patient.dobIntakeq} tebra={patient.dobTebra} merged={patient.dobTebra ?? patient.dobIntakeq} />
        <ComparisonRow label="Email" intakeq={patient.emailIntakeq} tebra={patient.emailTebra} merged={patient.emailTebra ?? patient.emailIntakeq} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Diagnoses & Medications</h2>
        <ul className="list-inside list-disc text-sm">
          {patient.diagnoses.map((d) => <li key={d.id}>{d.code} — {d.description}</li>)}
          {patient.medications.map((m) => <li key={m.id}>{m.name} ({m.medicationClass}), {m.dose}, since {m.startDate} — {m.status}</li>)}
        </ul>
      </section>
    </div>
  )
}

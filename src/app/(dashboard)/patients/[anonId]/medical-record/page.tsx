import { notFound } from 'next/navigation'
import { CalendarClock, CalendarCheck2, Stethoscope, Pill } from 'lucide-react'
import { BackLink } from '@/components/BackLink'
import { PatientAvatar } from '@/components/PatientAvatar'
import { AllergyBadge } from '@/components/AllergyBadge'
import { NoteForm, NoteCard } from '@/components/NoteForm'
import { InsuranceCardUpload } from '@/components/InsuranceCardUpload'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPatientDetail } from '@/lib/queries/patients'
import { listNotesForPatient } from '@/lib/queries/encounter-notes'
import { getPayerName } from '@/lib/queries/payers'
import { listDispensesForPatient } from '@/lib/queries/medication-dispenses'
import { listMedicationsWithInventory } from '@/lib/queries/medications'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
const SECTION_HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function formatDate(value: string | Date | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function VisitStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}

const PLAN_TYPE_LABEL: Record<string, string> = {
  ppo: 'PPO', hmo: 'HMO', epo: 'EPO', pos: 'POS', medicare: 'Medicare', medicaid: 'Medicaid',
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  self: 'Self', spouse: 'Spouse', child: 'Child', other: 'Other',
}

function InsuranceField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? '—'}</p>
    </div>
  )
}

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
  const notes = await listNotesForPatient(anonId)
  const primaryPayerName = await getPayerName(patient.primaryPayerId)
  const secondaryPayerName = await getPayerName(patient.secondaryPayerId)
  const dispenses = await listDispensesForPatient(anonId)
  const medicationCatalog = await listMedicationsWithInventory()
  const medicationById = new Map(medicationCatalog.map((m) => [m.id, m]))
  await logAudit(session, 'viewed patient medical record', anonId)

  const name = patient.nameTebra ?? patient.nameIntakeq
  const canWriteInsurance = ['admin', 'crc', 'frontdesk'].includes(session.role)

  return (
    <div className="max-w-4xl space-y-6">
      <BackLink href={`/patients/${anonId}`} label="Back to Patient" />

      <div className={SECTION}>
        <div className="flex items-center gap-4">
          <PatientAvatar name={name} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-foreground">{name}</h1>
            <p className="font-mono text-xs text-muted-foreground">{patient.id} · DOB {patient.dobTebra ?? patient.dobIntakeq}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Chart data as of {new Date(patient.chartDataAsOf).toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <VisitStat icon={CalendarClock} label="Last Visit" value={formatDate(patient.lastApptDate)} />
          <VisitStat icon={CalendarCheck2} label="Next Appointment" value={formatDate(patient.nextApptDate)} />
          <VisitStat icon={Stethoscope} label="Current Provider" value={patient.currentProvider ?? '—'} />
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
        <h2 className={SECTION_HEADING}>Diagnoses</h2>
        {patient.diagnoses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No diagnoses recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground">
            {patient.diagnoses.map((d) => (
              <li key={`dx-${d.id}`} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-b-0">
                <span><span className="font-mono text-xs text-muted-foreground">{d.code}</span> — {d.description}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d.source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Medication History</h2>
        {patient.medications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medications recorded.</p>
        ) : (
          <div className="space-y-4">
            {(['active', 'inactive'] as const).map((status) => {
              const meds = patient.medications.filter((m) => m.status === status)
              if (meds.length === 0) return null
              return (
                <div key={status}>
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${status === 'active' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {status === 'active' ? 'Currently Taking' : 'Past Medications'}
                  </p>
                  <ul className="space-y-1.5">
                    {meds.map((m) => (
                      <li key={`med-${m.id}`} className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{m.name} <span className="font-normal text-muted-foreground">({m.medicationClass})</span></p>
                          <p className="text-xs text-muted-foreground">
                            {m.dose ?? 'Dose not recorded'} · started {formatDate(m.startDate)}
                            {m.status === 'inactive' && m.stopDate ? ` · stopped ${formatDate(m.stopDate)}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Medications Dispensed</h2>
        {dispenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medications dispensed.</p>
        ) : (
          <ul className="space-y-1.5">
            {dispenses.map((d) => {
              const med = medicationById.get(d.medicationId)
              return (
                <li key={`dispense-${d.id}`} className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                  <Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{med?.name ?? `Medication #${d.medicationId}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.quantity} {med?.unit ?? 'units'} · dispensed by {d.dispensedByName} · {formatDate(d.dispensedAt)}
                    </p>
                  </div>
                </li>
              )
            })}
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

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Insurance</h2>
        {patient.primaryPayerId === null ? (
          <p className="text-sm text-muted-foreground">No insurance on file.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Primary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <InsuranceField label="Payer" value={primaryPayerName} />
                <InsuranceField label="Member ID" value={patient.primaryMemberId} />
                <InsuranceField label="Group Number" value={patient.primaryGroupNumber} />
                <InsuranceField label="Plan Type" value={patient.primaryPlanType ? PLAN_TYPE_LABEL[patient.primaryPlanType] : null} />
                <InsuranceField label="Subscriber" value={patient.primarySubscriberName} />
                <InsuranceField label="Relationship" value={patient.primarySubscriberRelationship ? RELATIONSHIP_LABEL[patient.primarySubscriberRelationship] : null} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Card — Front</p>
                  {patient.primaryCardFrontUrl && (
                    <a href={patient.primaryCardFrontUrl} target="_blank" rel="noopener noreferrer" className="mb-1.5 block">
                      <img src={patient.primaryCardFrontUrl} alt="Primary insurance card, front" className="h-24 w-auto rounded-md border border-border object-cover" />
                    </a>
                  )}
                  <InsuranceCardUpload anonId={anonId} side="front" hasImage={!!patient.primaryCardFrontUrl} canWrite={canWriteInsurance} />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Card — Back</p>
                  {patient.primaryCardBackUrl && (
                    <a href={patient.primaryCardBackUrl} target="_blank" rel="noopener noreferrer" className="mb-1.5 block">
                      <img src={patient.primaryCardBackUrl} alt="Primary insurance card, back" className="h-24 w-auto rounded-md border border-border object-cover" />
                    </a>
                  )}
                  <InsuranceCardUpload anonId={anonId} side="back" hasImage={!!patient.primaryCardBackUrl} canWrite={canWriteInsurance} />
                </div>
              </div>
            </div>

            {patient.secondaryPayerId !== null && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Secondary</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <InsuranceField label="Payer" value={secondaryPayerName} />
                  <InsuranceField label="Member ID" value={patient.secondaryMemberId} />
                  <InsuranceField label="Group Number" value={patient.secondaryGroupNumber} />
                  <InsuranceField label="Plan Type" value={patient.secondaryPlanType ? PLAN_TYPE_LABEL[patient.secondaryPlanType] : null} />
                  <InsuranceField label="Subscriber" value={patient.secondarySubscriberName} />
                  <InsuranceField label="Relationship" value={patient.secondarySubscriberRelationship ? RELATIONSHIP_LABEL[patient.secondarySubscriberRelationship] : null} />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={SECTION}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={SECTION_HEADING}>Notes</h2>
          <NoteForm patientId={anonId} canWrite={['pi', 'admin'].includes(session.role)} />
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes recorded.</p>
        ) : (
          <div className="space-y-2.5">
            {notes.map((n) => (
              <NoteCard
                key={n.id}
                patientId={anonId}
                canSign={n.status === 'draft' && (n.authorName === session.name || session.role === 'admin')}
                note={{
                  id: n.id,
                  noteType: n.noteType,
                  authorName: n.authorName,
                  authorRole: n.authorRole,
                  subjective: n.subjective,
                  objective: n.objective,
                  assessment: n.assessment,
                  plan: n.plan,
                  status: n.status,
                  createdAt: n.createdAt.toString(),
                  signedAt: n.signedAt?.toString() ?? null,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

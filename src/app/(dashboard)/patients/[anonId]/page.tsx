import { notFound } from 'next/navigation'
import { StatusChip } from '@/components/StatusChip'
import { EvidenceCard } from '@/components/EvidenceCard'
import { AllergyBadge } from '@/components/AllergyBadge'
import { RefreshEligibilityButton } from '@/components/RefreshEligibilityButton'
import { PatientPortalAccessPanel } from '@/components/PatientPortalAccessPanel'
import { PatientAvatar } from '@/components/PatientAvatar'
import { PatientQuickGlance } from '@/components/PatientQuickGlance'
import { Tabs } from '@/components/Tabs'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getPatientDetail } from '@/lib/queries/patients'

const SECTION = 'rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md'
const SECTION_HEADING = 'mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

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

  const name = patient.nameTebra ?? patient.nameIntakeq

  const overviewTab = (
    <div className="space-y-6">
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
        <ul className="space-y-1.5 text-sm text-foreground">
          {patient.diagnoses.map((d) => <li key={d.id}>{d.code} — {d.description}</li>)}
          {patient.medications.map((m) => <li key={m.id}>{m.name} ({m.medicationClass}), {m.dose}, since {m.startDate} — {m.status}</li>)}
        </ul>
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

  const screeningTab = (
    <section className={SECTION}>
      <h2 className={SECTION_HEADING}>Screening Evidence</h2>
      {patient.criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">No screening evidence yet — click Refresh from Source Systems to run eligibility.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Inclusion criteria</h3>
            <div className="space-y-3">
              {patient.criteria.filter((c) => c.criterionType !== 'exclusion').map((c) => <EvidenceCard key={c.id} criterion={c} />)}
            </div>
          </div>
          {patient.criteria.some((c) => c.criterionType === 'exclusion') && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-700">Exclusion criteria</h3>
              <div className="space-y-3">
                {patient.criteria.filter((c) => c.criterionType === 'exclusion').map((c) => <EvidenceCard key={c.id} criterion={c} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )

  const identityAndPortalTab = (
    <div className="space-y-6">
      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Identity Verification</h2>
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

      <section className={SECTION}>
        <h2 className={SECTION_HEADING}>Patient Portal Access</h2>
        <PatientPortalAccessPanel anonId={patient.id} initialConfigured={patient.portalConfigured} isAdmin={session.role === 'admin'} />
      </section>
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <div className={`${SECTION} flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <PatientAvatar name={name} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-foreground">{name}</h1>
            <p className="font-mono text-xs text-muted-foreground">{patient.id} · DOB {patient.dobTebra ?? patient.dobIntakeq}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {patient.overallStatus && <RefreshEligibilityButton anonId={patient.id} />}
          <StatusChip status={patient.overallStatus ?? 'yellow'} />
        </div>
      </div>
      {!patient.overallStatus && (
        <p className="text-xs text-muted-foreground">Not currently enrolled in a trial — assign this patient to a trial to run an eligibility check.</p>
      )}

      <PatientQuickGlance
        provider={patient.currentProvider}
        chartDataAsOf={patient.chartDataAsOf.toString()}
        identityVerified={!!patient.identityVerification?.verified}
        criteriaCount={patient.criteria.length}
      />

      <Tabs tabs={[
        { id: 'overview', label: 'Overview', content: overviewTab },
        { id: 'screening', label: 'Screening', content: screeningTab },
        { id: 'identity', label: 'Identity & Portal', content: identityAndPortalTab },
      ]} />
    </div>
  )
}

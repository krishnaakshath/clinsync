import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, CheckCircle2, AlertTriangle, XCircle, FlaskConical, FileSignature, Pill, ClipboardList, Clock } from 'lucide-react'
import { requireSessionOrRedirect } from '@/lib/auth'
import { resolveSessionProvider } from '@/lib/provider-identity'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listActiveProviders } from '@/lib/queries/providers'
import { listPendingAssignmentsForProvider } from '@/lib/queries/doctor-assignments'
import { listAppointmentsInRange } from '@/lib/queries/appointments'
import { listWorklist } from '@/lib/queries/lab-orders'
import { listFormSubmissions } from '@/lib/queries/form-submissions'
import { PatientAvatar } from '@/components/PatientAvatar'
import { AssignmentScheduleModalTrigger } from '@/components/AssignmentScheduleModal'
import { DashboardAppointmentsTable, type DashboardAppointmentRow } from '@/components/DashboardAppointmentsTable'
import { PatientsTable } from '@/components/PatientsTable'

const SECTION = 'mb-6 overflow-hidden rounded-md border border-border bg-card'
const SECTION_HEADER = 'flex items-center justify-between border-b border-border px-5 py-3'
const SECTION_TITLE = 'text-sm font-semibold text-foreground'
const SECTION_BODY = 'p-5'

const TILE_COLOR: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

function StatTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: keyof typeof TILE_COLOR }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TILE_COLOR[color]}`} aria-hidden="true">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

const URGENCY_BADGE: Record<string, string> = {
  emergency: 'bg-destructive/10 text-destructive',
  urgent: 'bg-warning/10 text-warning',
  routine: 'bg-muted text-muted-foreground',
}

export default async function DoctorPortalPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  if (session.role !== 'pi') redirect('/')

  const patients = await listPatientsWithStatus(null)
  // Match on last name for backward compat with free-text currentProvider field in seed
  const lastName = session.name.trim().split(/\s+/).pop() ?? session.name
  const myPatients = patients.filter((p) => (p.currentProvider ?? '').toLowerCase().includes(lastName.toLowerCase()))

  const resolvedProvider = await resolveSessionProvider(session)
  const providerMatch = resolvedProvider ?? (await listActiveProviders()).find((p) => p.name.toLowerCase().includes(lastName.toLowerCase()))
  const pendingAssignments = providerMatch ? await listPendingAssignmentsForProvider(providerMatch.id) : []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const myAppointments = await listAppointmentsInRange(rangeStart, rangeEnd, providerMatch ? [providerMatch.id] : [])
  const todaysCheckups = myAppointments.filter((a) => {
    const d = new Date(a.startsAt)
    return d >= todayStart && d < todayEnd
  })

  // Lab reports pending review — scoped to this provider's patients
  const labWorklist = await listWorklist()
  const myPatientIds = new Set(myPatients.map((p) => p.id))
  const pendingLabs = labWorklist.filter((l) => myPatientIds.has(l.patientId) && l.status === 'ordered')

  // Client forms submitted and completed — for clinical verification
  const completedForms = await listFormSubmissions({ status: 'completed' })
  const myForms = completedForms.filter((f) => myPatientIds.has(f.patientId)).slice(0, 10)

  await logAudit(session, 'viewed My Patients (doctor portal)', null)

  const meetsCount = myPatients.filter((p) => p.overallStatus === 'green').length
  const needsVerificationCount = myPatients.filter((p) => !p.overallStatus || p.overallStatus === 'yellow').length
  const exclusionCount = myPatients.filter((p) => p.overallStatus === 'red').length

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4 border-b border-border pb-5">
        <PatientAvatar name={session.name} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Doctor Portal</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {session.name}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Users} value={myPatients.length} label="Assigned patients" color="primary" />
        <StatTile icon={CheckCircle2} value={meetsCount} label="Meets criteria" color="success" />
        <StatTile icon={AlertTriangle} value={needsVerificationCount} label="Needs review" color="warning" />
        <StatTile icon={XCircle} value={exclusionCount} label="Excluded" color="destructive" />
      </div>

      {/* Two-column layout for today's work */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Today's Checkups */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <span className={SECTION_TITLE}>Today&apos;s Checkups</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{todaysCheckups.length}</span>
          </div>
          {todaysCheckups.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No checkups scheduled for today.</p>
          ) : (
            <ul className="divide-y divide-border">
              {todaysCheckups.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground">{a.visitReason} · {new Date(a.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <Link href={`/patients/${a.patientId}`} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Today's Assignments (Check-ins routing to this doctor) */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <span className={SECTION_TITLE}>Pending Assignments</span>
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">{pendingAssignments.length}</span>
          </div>
          {pendingAssignments.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No pending assignments.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pendingAssignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.reason}</p>
                    <p className="text-xs text-muted-foreground">{a.patientId} · {a.visitType}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${URGENCY_BADGE[a.urgency] ?? 'bg-muted text-muted-foreground'}`}>{a.urgency}</span>
                    <AssignmentScheduleModalTrigger assignment={a} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lab Reports (pending review) */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <span className={SECTION_TITLE}>Lab Reports — Pending Review</span>
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{pendingLabs.length}</span>
          </div>
          {pendingLabs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No pending lab results.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLabs.slice(0, 5).map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground">{l.patientId}</td>
                      <td className="p-3 text-foreground">{l.testName}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-warning">{l.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pendingLabs.length > 5 && (
            <div className="border-t border-border px-5 py-3">
              <Link href="/labs" className="text-xs font-medium text-primary hover:underline">View all {pendingLabs.length} lab orders →</Link>
            </div>
          )}
        </div>

        {/* Client Forms submitted for clinical verification */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <span className={SECTION_TITLE}>Client Forms — Submitted</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{myForms.length}</span>
          </div>
          {myForms.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No submitted forms to review.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submitted</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {myForms.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground">{f.patientName}</td>
                      <td className="p-3 text-foreground">{f.templateName}</td>
                      <td className="p-3 text-muted-foreground">{f.completedDate ? new Date(f.completedDate).toLocaleDateString() : '—'}</td>
                      <td className="p-3">
                        <Link href={`/client-forms/${f.id}`} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted">Review</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Appointments overview */}
      <div className={SECTION}>
        <div className={SECTION_HEADER}>
          <span className={SECTION_TITLE}>All Appointments</span>
          <Link href="/calendar" className="text-xs font-medium text-primary hover:underline">View Calendar</Link>
        </div>
        <div className={SECTION_BODY}>
          <DashboardAppointmentsTable
            appointments={myAppointments.map((a) => ({
              id: a.id, patientId: a.patientId, patientName: a.patientName, providerName: a.providerName,
              visitReason: a.visitReason, status: a.status, startsAt: a.startsAt.toString(),
            })) as DashboardAppointmentRow[]}
            canStartTelemedicine
          />
        </div>
      </div>

      {/* My Patients full table */}
      <div className={SECTION}>
        <div className={SECTION_HEADER}>
          <span className={SECTION_TITLE}>My Assigned Patients</span>
          <Link href="/patients" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </div>
        <div className={SECTION_BODY}>
          <PatientsTable patients={myPatients.map((p) => ({
            id: p.id,
            overallStatus: p.overallStatus,
            name: p.name,
            dob: p.dob,
            currentProvider: p.currentProvider,
            referralType: p.referralType,
            lastCommunication: p.lastCommunication,
            criteriaSummary: p.criteriaSummary,
          }))} />
        </div>
      </div>
    </div>
  )
}

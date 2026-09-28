import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listFormTemplates } from '@/lib/queries/form-templates'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAppointmentsInRange } from '@/lib/queries/appointments'
import { listAllUsers } from '@/lib/queries/users'
import { AdminDashboard } from '@/components/dashboards/AdminDashboard'
import { CoordinatorDashboard } from '@/components/dashboards/CoordinatorDashboard'
import { FrontDeskDashboard } from '@/components/dashboards/FrontDeskDashboard'

export default async function DashboardHomePage() {
  const session = await requireSessionOrRedirect()

  // PI has its own dedicated dashboard route (My Patients) -- keeping it as
  // a real separate route rather than a conditional render here avoids
  // duplicating /doctor's assignment-matching logic in two places.
  if (session.role === 'pi') redirect('/doctor')
  // Called and awaited directly (not `<FrontDeskDashboard session={session} />`) so this
  // page resolves to a plain, already-rendered element tree instead of an unresolved async
  // component nested inside another one's return value -- React's client renderer (used by
  // @testing-library/react in tests) can't render an async component directly as JSX.
  if (session.role === 'frontdesk') {
    await logAudit(session, 'viewed front desk dashboard', null)
    return await FrontDeskDashboard({ session })
  }

  const now = new Date()
  const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rangeEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [data, templates, patients, appointmentsInRange, allStaff] = await Promise.all([
    getDashboardData(),
    listFormTemplates(),
    listPatientsWithStatus(null),
    listAppointmentsInRange(rangeStart, rangeEnd),
    listAllUsers(),
  ])
  await logAudit(session, 'viewed home dashboard', null)

  const staffByRole = ['admin', 'pi', 'crc', 'frontdesk'].map((role) => ({
    role,
    count: allStaff.filter((u) => u.role === role).length,
  }))

  const props = {
    session,
    data,
    templates: templates.map((t) => ({ id: t.id, name: t.name })),
    patients: patients.map((p) => ({ id: p.id, nameTebra: p.nameTebra, nameIntakeq: p.nameIntakeq })),
    appointmentsInRange: appointmentsInRange.map((a) => ({
      id: a.id, patientId: a.patientId, patientName: a.patientName, providerName: a.providerName,
      visitReason: a.visitReason, status: a.status, startsAt: a.startsAt.toString(),
    })),
    staffByRole,
    // spec §6's role table: only admin/pi may start a telemedicine session
    // for an appointment -- this page only ever renders AdminDashboard or
    // CoordinatorDashboard (crc), so `admin` is the only role that reaches
    // here with this true, but the check is written against the full
    // allow-list to match the API route's own role gate exactly.
    canStartTelemedicine: (['admin', 'pi'] as string[]).includes(session.role),
  }

  return session.role === 'admin' ? <AdminDashboard {...props} /> : <CoordinatorDashboard {...props} />
}

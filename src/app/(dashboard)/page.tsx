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
  // page resolves to a plain, already-rendered element tree -- consistent with every other
  // async page component in this app, which await their own data before returning JSX,
  // rather than nesting an unresolved async component inside another one's return value.
  if (session.role === 'frontdesk') return await FrontDeskDashboard({ session })

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

  const staffByRole = ['admin', 'pi', 'crc'].map((role) => ({
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
  }

  return session.role === 'admin' ? <AdminDashboard {...props} /> : <CoordinatorDashboard {...props} />
}

import type { Session } from '@/lib/auth'

export interface DashboardData {
  latestForms: { id: number; status: string; sentDate: Date | null; completedDate: Date | null; templateName: string; patientName: string }[]
  pendingForms: { id: number; status: string; sentDate: Date | null; completedDate: Date | null; templateName: string; patientName: string }[]
  pendingFormsTotal: number
  pendingClassification: { id: string; nameTebra: string | null; nameIntakeq: string }[]
  recentEvents: { id: number; action: string; userName: string; timestamp: Date }[]
  patientsByMonth: { month: string; count: number }[]
  screeningBreakdown: { green: number; yellow: number; red: number }
  peakHourRange: string | null
  avgExperienceRating: number | null
  completedReviewCount: number
}

export interface DashboardPageProps {
  session: Session
  data: DashboardData
  templates: { id: number; name: string }[]
  patients: { id: string; nameTebra: string | null; nameIntakeq: string }[]
  appointmentsInRange: { id: number; patientId: string; patientName: string; providerName: string; visitReason: string; status: string; startsAt: string }[]
  staffByRole: { role: string; count: number }[]
}

export function AdminDashboard(props: DashboardPageProps) {
  return <div>Admin dashboard placeholder for {props.session.name}</div>
}

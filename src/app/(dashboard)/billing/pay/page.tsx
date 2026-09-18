import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listPatientsWithStatus } from '@/lib/queries/patients'
import { VirtualCardPaymentForm } from '@/components/VirtualCardPaymentForm'

export default async function VirtualCardPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; amountCents?: string }>
}) {
  const session = await requireSessionOrRedirect()
  const { patientId, amountCents } = await searchParams
  const patients = await listPatientsWithStatus(null)
  await logAudit(session, 'viewed virtual card payment form (demo)', patientId ?? null)

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Virtual Card Payment</h1>
      <VirtualCardPaymentForm
        patients={patients.map((p) => ({ id: p.id, name: p.nameTebra ?? p.nameIntakeq }))}
        initialPatientId={patientId}
        initialAmountCents={amountCents ? Number(amountCents) : undefined}
      />
    </div>
  )
}

import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listMedicationsWithInventory, listActiveMedicationEpisodeSummary } from '@/lib/queries/medications'
import { PharmacyDashboard } from '@/components/PharmacyDashboard'

export default async function PharmacyPage() {
  const session = await requireSessionOrRedirect()
  const medications = await listMedicationsWithInventory()
  const prescribedSummary = await listActiveMedicationEpisodeSummary()
  await logAudit(session, 'viewed pharmacy dashboard', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Pharmacy</h1>
      <PharmacyDashboard
        medications={medications}
        canDispense={['admin', 'pi', 'pharmacy'].includes(session.role)}
        prescribedSummary={prescribedSummary}
        canAddMedication={['admin', 'pharmacy'].includes(session.role)}
      />
    </div>
  )
}

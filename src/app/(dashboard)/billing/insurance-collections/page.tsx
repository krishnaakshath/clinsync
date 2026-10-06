import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { listInsuranceClaims } from '@/lib/queries/insurance-claims'
import { InsuranceClaimsTable } from '@/components/InsuranceClaimsTable'

export default async function InsuranceCollectionsPage() {
  const session = await requireSessionOrRedirect()
  if (!canAccessOperations(session.role)) redirect('/')
  const claims = await listInsuranceClaims()
  await logAudit(session, 'viewed insurance collections', null)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Insurance Collections</h1>
      <InsuranceClaimsTable claims={claims} />
    </div>
  )
}

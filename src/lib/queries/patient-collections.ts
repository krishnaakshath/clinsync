import { getDb } from '@/db/client'
import { charges, insuranceClaims, mockPayments, patients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, patientCollectionsListCacheKey } from '@/lib/cache'

export async function listPatientCollections() {
  return getOrSetCache(patientCollectionsListCacheKey(), 30, async () => {
    const db = getDb()
    const submittedCharges = await db.select().from(charges).where(eq(charges.status, 'submitted'))
    const claims = await db.select().from(insuranceClaims)
    const payments = await db.select().from(mockPayments)
    const allPatients = await db.select().from(patients)

    const byPatient = new Map<string, { balanceCents: number; unappliedCents: number; statementCount: number }>()

    for (const charge of submittedCharges) {
      const insurancePaid = claims
        .filter((c) => c.chargeId === charge.id)
        .reduce((sum, c) => sum + (c.paidAmountCents ?? 0), 0)
      const amountDueFromPatient = Math.max(0, charge.amountCents - insurancePaid)

      const patientPaidRaw = payments
        .filter((p) => p.chargeId === charge.id && p.result === 'success')
        .reduce((sum, p) => sum + p.amountCents, 0)
      const patientPaidApplied = Math.min(patientPaidRaw, amountDueFromPatient)
      const balance = Math.max(0, amountDueFromPatient - patientPaidApplied)
      const unapplied = Math.max(0, patientPaidRaw - patientPaidApplied)

      const existing = byPatient.get(charge.patientId) ?? { balanceCents: 0, unappliedCents: 0, statementCount: 0 }
      byPatient.set(charge.patientId, {
        balanceCents: existing.balanceCents + balance,
        unappliedCents: existing.unappliedCents + unapplied,
        statementCount: existing.statementCount,
      })
    }

    return Array.from(byPatient.entries())
      .filter(([, v]) => v.balanceCents > 0 || v.unappliedCents > 0)
      .map(([patientId, v]) => {
        const patient = allPatients.find((p) => p.id === patientId)
        return {
          patientId,
          patientName: patient ? (patient.nameTebra ?? patient.nameIntakeq) : patientId,
          balanceCents: v.balanceCents,
          unappliedCents: v.unappliedCents,
        }
      })
      .sort((a, b) => b.balanceCents - a.balanceCents)
  })
}

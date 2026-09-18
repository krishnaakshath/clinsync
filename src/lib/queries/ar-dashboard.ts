import { getDb } from '@/db/client'
import { charges, insuranceClaims, mockPayments } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getOrSetCache, arDashboardCacheKey } from '@/lib/cache'

export interface AgingBucket { label: string; outstandingCents: number }

const BUCKETS = [
  { label: '0-30', min: 0, max: 30 },
  { label: '31-60', min: 31, max: 60 },
  { label: '61-90', min: 61, max: 90 },
  { label: '91-120', min: 91, max: 120 },
  { label: '121+', min: 121, max: Infinity },
]

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export async function getArDashboardData(now: Date = new Date()) {
  return getOrSetCache(arDashboardCacheKey(), 15, async () => {
    const db = getDb()
    const submittedCharges = await db.select().from(charges).where(eq(charges.status, 'submitted'))
    const claims = await db.select().from(insuranceClaims)
    const payments = await db.select().from(mockPayments)

    let outstandingCents = 0
    let totalBilledCents = 0
    let totalCollectedCents = 0
    let ageWeightedDaysSum = 0
    let outstandingWeightSum = 0
    const buckets: AgingBucket[] = BUCKETS.map((b) => ({ label: b.label, outstandingCents: 0 }))

    for (const charge of submittedCharges) {
      const insurancePaid = claims
        .filter((c) => c.chargeId === charge.id)
        .reduce((sum, c) => sum + (c.paidAmountCents ?? 0), 0)
      const patientPaid = payments
        .filter((p) => p.chargeId === charge.id && p.result === 'success')
        .reduce((sum, p) => sum + p.amountCents, 0)
      const totalPaid = insurancePaid + Math.min(patientPaid, Math.max(0, charge.amountCents - insurancePaid))
      const outstanding = Math.max(0, charge.amountCents - totalPaid)

      totalBilledCents += charge.amountCents
      totalCollectedCents += Math.min(totalPaid, charge.amountCents)
      outstandingCents += outstanding

      if (outstanding > 0) {
        const age = daysBetween(new Date(charge.dateOfService), now)
        const bucketIndex = BUCKETS.findIndex((b) => age >= b.min && age <= b.max)
        if (bucketIndex >= 0) buckets[bucketIndex].outstandingCents += outstanding
        ageWeightedDaysSum += age * outstanding
        outstandingWeightSum += outstanding
      }
    }

    const grossCollectionRate = totalBilledCents > 0 ? (totalCollectedCents / totalBilledCents) * 100 : 0
    const avgDaysInAr = outstandingWeightSum > 0 ? ageWeightedDaysSum / outstandingWeightSum : 0

    return {
      outstandingArCents: outstandingCents,
      grossCollectionRate,
      avgDaysInAr,
      agingBuckets: buckets,
    }
  })
}

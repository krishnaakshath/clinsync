import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { patients, carePlans, carePlanGoals } from '@/db/schema'
import { createCarePlan, listCarePlansForPatient, updateGoalStatus } from '@/lib/queries/care-plans'

const createdPlanIds: number[] = []
afterEach(async () => {
  while (createdPlanIds.length > 0) {
    const id = createdPlanIds.pop()!
    await getDb().delete(carePlanGoals).where(eq(carePlanGoals.carePlanId, id))
    await getDb().delete(carePlans).where(eq(carePlans.id, id))
  }
})

describe('createCarePlan', () => {
  it('creates a plan with goals, all defaulting to active', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const result = await createCarePlan({
      patientId: patientRow.id, title: 'Initial Plan', authorName: 'Dr. Test', nextReviewDate: null,
      goals: [{ description: 'Reduce PHQ-9 below 10', targetDate: null }, { description: 'Attend weekly CBT', targetDate: null }],
    })
    createdPlanIds.push(result.id)
    expect(result.supersededPlanId).toBeNull()

    const [plans] = [await listCarePlansForPatient(patientRow.id)]
    const created = plans.find((p) => p.id === result.id)!
    expect(created.status).toBe('active')
    expect(created.goals).toHaveLength(2)
    expect(created.goals.every((g) => g.status === 'active')).toBe(true)
  })

  it('supersedes the prior active plan instead of deleting it (Review Focus #1)', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const first = await createCarePlan({ patientId: patientRow.id, title: 'First Plan', authorName: 'Dr. Test', nextReviewDate: null, goals: [] })
    createdPlanIds.push(first.id)

    const second = await createCarePlan({ patientId: patientRow.id, title: 'Second Plan', authorName: 'Dr. Test', nextReviewDate: null, goals: [] })
    createdPlanIds.push(second.id)
    expect(second.supersededPlanId).toBe(first.id)

    const plans = await listCarePlansForPatient(patientRow.id)
    const firstAfter = plans.find((p) => p.id === first.id)!
    const secondAfter = plans.find((p) => p.id === second.id)!
    expect(firstAfter.status).toBe('superseded')
    expect(firstAfter.supersededAt).not.toBeNull()
    expect(secondAfter.status).toBe('active')
  })
})

describe('listCarePlansForPatient patient scoping (Review Focus #2)', () => {
  it('two patients care plan histories stay independent', async () => {
    const patientsRows = await getDb().select().from(patients).limit(2)
    const [patientA, patientB] = patientsRows
    const planA = await createCarePlan({ patientId: patientA.id, title: 'Plan A', authorName: 'Dr. Test', nextReviewDate: null, goals: [] })
    createdPlanIds.push(planA.id)
    const planB = await createCarePlan({ patientId: patientB.id, title: 'Plan B', authorName: 'Dr. Test', nextReviewDate: null, goals: [] })
    createdPlanIds.push(planB.id)

    const historyA = await listCarePlansForPatient(patientA.id)
    const historyB = await listCarePlansForPatient(patientB.id)
    expect(historyA.some((p) => p.id === planB.id)).toBe(false)
    expect(historyB.some((p) => p.id === planA.id)).toBe(false)
  })
})

describe('updateGoalStatus', () => {
  it('transitions an active goal to a terminal status', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const plan = await createCarePlan({ patientId: patientRow.id, title: 'Plan', authorName: 'Dr. Test', nextReviewDate: null, goals: [{ description: 'Goal 1', targetDate: null }] })
    createdPlanIds.push(plan.id)
    const [goal] = await getDb().select().from(carePlanGoals).where(eq(carePlanGoals.carePlanId, plan.id))

    const result = await updateGoalStatus(goal.id, 'met', 'Dr. Test')
    expect(result.ok).toBe(true)

    const [updated] = await getDb().select().from(carePlanGoals).where(eq(carePlanGoals.id, goal.id))
    expect(updated.status).toBe('met')
    expect(updated.statusUpdatedByName).toBe('Dr. Test')
    expect(updated.statusUpdatedAt).not.toBeNull()
  })

  it('rejects transitioning an already-terminal goal (Review Focus #3)', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const plan = await createCarePlan({ patientId: patientRow.id, title: 'Plan', authorName: 'Dr. Test', nextReviewDate: null, goals: [{ description: 'Goal 1', targetDate: null }] })
    createdPlanIds.push(plan.id)
    const [goal] = await getDb().select().from(carePlanGoals).where(eq(carePlanGoals.carePlanId, plan.id))

    const first = await updateGoalStatus(goal.id, 'met', 'Dr. Test')
    expect(first.ok).toBe(true)
    const second = await updateGoalStatus(goal.id, 'not_met', 'Dr. Someone Else')
    expect(second.ok).toBe(false)

    const [unchanged] = await getDb().select().from(carePlanGoals).where(eq(carePlanGoals.id, goal.id))
    expect(unchanged.status).toBe('met') // unchanged by the rejected second call
    expect(unchanged.statusUpdatedByName).toBe('Dr. Test') // not overwritten
  })

  it('only one of two concurrent status updates on the same goal succeeds (Review Focus #5)', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    const plan = await createCarePlan({ patientId: patientRow.id, title: 'Plan', authorName: 'Dr. Test', nextReviewDate: null, goals: [{ description: 'Goal 1', targetDate: null }] })
    createdPlanIds.push(plan.id)
    const [goal] = await getDb().select().from(carePlanGoals).where(eq(carePlanGoals.carePlanId, plan.id))

    const [resultA, resultB] = await Promise.all([
      updateGoalStatus(goal.id, 'met', 'Dr. A'),
      updateGoalStatus(goal.id, 'discontinued', 'Dr. B'),
    ])
    const okCount = [resultA.ok, resultB.ok].filter(Boolean).length
    expect(okCount).toBe(1)
  })
})

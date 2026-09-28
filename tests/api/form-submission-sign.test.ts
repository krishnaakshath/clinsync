import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { POST } from '@/app/api/patients/[anonId]/form-submissions/[id]/sign/route'
import { getDb } from '@/db/client'
import { patients, formTemplates, formSubmissions, signatures } from '@/db/schema'

const PATIENT_ID = 'RD-0001' // seeded real patient

let sessionPatientId: string | null = PATIENT_ID
vi.mock('@/lib/patient-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/patient-session')>('@/lib/patient-session')
  return {
    ...actual,
    requirePatientSession: vi.fn(async () =>
      sessionPatientId ? { patientId: sessionPatientId } : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ),
  }
})

const createdTemplateIds: number[] = []
const createdSubmissionIds: number[] = []
afterEach(async () => {
  sessionPatientId = PATIENT_ID
  while (createdSubmissionIds.length > 0) {
    const id = createdSubmissionIds.pop()!
    await getDb().delete(signatures).where(eq(signatures.signableId, id))
    await getDb().delete(formSubmissions).where(eq(formSubmissions.id, id))
  }
  while (createdTemplateIds.length > 0) await getDb().delete(formTemplates).where(eq(formTemplates.id, createdTemplateIds.pop()!))
})

async function makeSubmission(category: string, status: 'sent' | 'partial' | 'completed' = 'partial') {
  const db = getDb()
  const [template] = await db.insert(formTemplates).values({ name: `Test ${category} ${Date.now()}`, category, diagnosisTag: 'test', questions: [] }).returning()
  createdTemplateIds.push(template.id)
  const [submission] = await db.insert(formSubmissions).values({ templateId: template.id, patientId: PATIENT_ID, status }).returning()
  createdSubmissionIds.push(submission.id)
  return submission
}

function req(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

describe('POST /api/patients/[anonId]/form-submissions/[id]/sign', () => {
  it('signs a consent-category submission and marks it completed', async () => {
    const submission = await makeSubmission('Consent Forms')
    const res = await POST(req({ typedName: 'Maria Alvarez' }) as never, { params: Promise.resolve({ anonId: PATIENT_ID, id: String(submission.id) }) })
    expect(res.status).toBe(200)

    const [updated] = await getDb().select().from(formSubmissions).where(eq(formSubmissions.id, submission.id))
    expect(updated.status).toBe('completed')
    const sigRows = await getDb().select().from(signatures).where(eq(signatures.signableId, submission.id))
    expect(sigRows.some((s) => s.signableType === 'form_submission' && s.signerTypedName === 'Maria Alvarez')).toBe(true)
  })

  it('rejects a non-consent-category template', async () => {
    const submission = await makeSubmission('Screening Questionnaires')
    const res = await POST(req({ typedName: 'Maria Alvarez' }) as never, { params: Promise.resolve({ anonId: PATIENT_ID, id: String(submission.id) }) })
    expect(res.status).toBe(400)
    const [unchanged] = await getDb().select().from(formSubmissions).where(eq(formSubmissions.id, submission.id))
    expect(unchanged.status).toBe('partial')
  })

  it('rejects an already-completed submission', async () => {
    const submission = await makeSubmission('Consent Forms', 'completed')
    const res = await POST(req({ typedName: 'Maria Alvarez' }) as never, { params: Promise.resolve({ anonId: PATIENT_ID, id: String(submission.id) }) })
    expect(res.status).toBe(409)
  })

  it('rejects a missing typedName', async () => {
    const submission = await makeSubmission('Consent Forms')
    const res = await POST(req({}) as never, { params: Promise.resolve({ anonId: PATIENT_ID, id: String(submission.id) }) })
    expect(res.status).toBe(400)
  })

  it('rejects signing through a mismatched anonId', async () => {
    const submission = await makeSubmission('Consent Forms')
    const res = await POST(req({ typedName: 'Someone Else' }) as never, { params: Promise.resolve({ anonId: 'RD-0002', id: String(submission.id) }) })
    expect(res.status).toBe(403)
  })
})

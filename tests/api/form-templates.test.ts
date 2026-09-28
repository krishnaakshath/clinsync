import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/form-templates/route'
import { GET as getOneTemplate, PUT as putTemplate } from '@/app/api/form-templates/[id]/route'
import { getDb } from '@/db/client'
import { formTemplates, auditLog } from '@/db/schema'
import { eq, desc, or, like } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// "creates a blank template" really inserts a row via the POST route -- there
// is no DELETE API route for form templates, so clean up with a direct DB
// delete on the id it returns, to avoid leaving a stray "Untitled Form"
// template behind in the dev DB.
let createdTemplateId: number | undefined

afterEach(async () => {
  if (createdTemplateId == null) return
  await getDb().delete(formTemplates).where(eq(formTemplates.id, createdTemplateId))
  createdTemplateId = undefined
})

// The "audit logging" tests below insert real auditLog rows via the real
// GET handlers -- clean them up too, or they accumulate in the shared DB.
afterAll(async () => {
  await getDb().delete(auditLog).where(or(eq(auditLog.action, 'viewed form templates list'), like(auditLog.action, 'viewed form template %')))
})

describe('GET /api/form-templates', () => {
  it('returns the seeded templates', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(2)
  })
})

describe('GET /api/form-templates audit logging', () => {
  it('logs an audit entry when the template list is viewed', async () => {
    await GET()
    // Scoped to this test's own action string, not "the globally latest row"
    // -- the shared dev DB has concurrent writers (other branches/worktrees),
    // so an unscoped "latest row" read is racy and can pick up someone else's
    // audit entry written between this call and the read.
    const [latest] = await getDb().select().from(auditLog).where(eq(auditLog.action, 'viewed form templates list')).orderBy(desc(auditLog.id)).limit(1)
    expect(latest?.action).toBe('viewed form templates list')
  })

  it('logs an audit entry when a single template is viewed', async () => {
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    const req = new Request(`http://localhost/api/form-templates/${existing.id}`)
    await getOneTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    const action = `viewed form template ${existing.id}`
    const [latest] = await getDb().select().from(auditLog).where(eq(auditLog.action, action)).orderBy(desc(auditLog.id)).limit(1)
    expect(latest?.action).toBe(action)
  })
})

describe('POST /api/form-templates', () => {
  it('rejects a payload missing required fields', async () => {
    const req = new Request('http://localhost/api/form-templates', { method: 'POST', body: JSON.stringify({ name: 'x' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates a blank template for the Create New Form flow', async () => {
    const req = new Request('http://localhost/api/form-templates', { method: 'POST', body: JSON.stringify({ name: 'Untitled Form', category: 'Consent Forms', diagnosisTag: 'General', questions: [] }) })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdTemplateId = body.id
  })

  it('rejects a select question whose optionScores length does not match options (final review I3)', async () => {
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mismatched Scores Form', category: 'Screening Questionnaires', diagnosisTag: 'Test',
        questions: [{ id: 'q1', label: 'Q', type: 'select', options: ['A', 'B', 'C'], optionScores: [0, 5], hipaaSensitive: false, required: true }],
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid template payload')
  })

  it('accepts a select question whose optionScores length matches options', async () => {
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `Matched Scores Form ${Date.now()}`, category: 'Screening Questionnaires', diagnosisTag: 'Test',
        questions: [{ id: 'q1', label: 'Q', type: 'select', options: ['A', 'B'], optionScores: [0, 5], hipaaSensitive: false, required: true }],
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdTemplateId = body.id
  })

  it('accepts a non-scored, non-select question with neither options nor optionScores', async () => {
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `Plain Text Form ${Date.now()}`, category: 'Consent Forms', diagnosisTag: 'General',
        questions: [{ id: 'q1', label: 'Notes', type: 'text', hipaaSensitive: false, required: false }],
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdTemplateId = body.id
  })
})

describe('PUT /api/form-templates/[id]', () => {
  it('rejects a select question whose optionScores length does not match options (final review I3)', async () => {
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    const req = new Request(`http://localhost/api/form-templates/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        questions: [{ id: 'q1', label: 'Q', type: 'select', options: ['A', 'B', 'C'], optionScores: [0, 5], hipaaSensitive: false, required: true }],
      }),
    })
    const res = await putTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid template payload')
  })
})

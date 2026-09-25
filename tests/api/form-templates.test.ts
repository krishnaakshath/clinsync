import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/form-templates/route'
import { GET as getOneTemplate } from '@/app/api/form-templates/[id]/route'
import { getDb } from '@/db/client'
import { formTemplates, auditLog } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

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
    const [latest] = await getDb().select().from(auditLog).orderBy(desc(auditLog.id)).limit(1)
    expect(latest.action).toBe('viewed form templates list')
  })

  it('logs an audit entry when a single template is viewed', async () => {
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    const req = new Request(`http://localhost/api/form-templates/${existing.id}`)
    await getOneTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    const [latest] = await getDb().select().from(auditLog).orderBy(desc(auditLog.id)).limit(1)
    expect(latest.action).toBe(`viewed form template ${existing.id}`)
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
})

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/form-templates/route'
import { GET as getOneTemplate, PUT as putTemplate } from '@/app/api/form-templates/[id]/route'
import { getDb } from '@/db/client'
import { formTemplates, formTemplateFolders, auditLog } from '@/db/schema'
import { eq, desc, or, like } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz', userId: null })) }))

// Folders created directly for the folderId tests below -- separate from
// createdTemplateId, which only ever tracks one template at a time.
let createdFolderIds: number[] = []
afterEach(async () => {
  for (const id of createdFolderIds) {
    await getDb().delete(formTemplateFolders).where(eq(formTemplateFolders.id, id))
  }
  createdFolderIds = []
})

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

describe('folderId on /api/form-templates', () => {
  async function makeFolder(name: string) {
    const [folder] = await getDb().insert(formTemplateFolders).values({ name }).returning()
    createdFolderIds.push(folder.id)
    return folder
  }

  it('POST accepts folderId and stores it on the created row', async () => {
    const folder = await makeFolder('Folder For POST')
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Untitled Form', category: 'Uncategorized', diagnosisTag: 'General', questions: [], folderId: folder.id }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdTemplateId = body.id
    expect(body.folderId).toBe(folder.id)
  })

  it('POST accepts folderId: null', async () => {
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Untitled Form', category: 'Uncategorized', diagnosisTag: 'General', questions: [], folderId: null }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdTemplateId = body.id
    expect(body.folderId).toBeNull()
  })

  it('POST rejects a folderId pointing at no folder', async () => {
    const req = new Request('http://localhost/api/form-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Untitled Form', category: 'Uncategorized', diagnosisTag: 'General', questions: [], folderId: 999999999 }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('PUT accepts folderId and files the template', async () => {
    const folder = await makeFolder('Folder For PUT')
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    const req = new Request(`http://localhost/api/form-templates/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ folderId: folder.id }),
    })
    const res = await putTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    expect(res.status).toBe(200)
    const [row] = await getDb().select().from(formTemplates).where(eq(formTemplates.id, existing.id))
    expect(row.folderId).toBe(folder.id)

    // Restore this pre-existing seeded row to its prior (un-filed) state so
    // this test doesn't leave a permanent side effect on shared seed data.
    await getDb().update(formTemplates).set({ folderId: null }).where(eq(formTemplates.id, existing.id))
  })

  it('PUT accepts folderId: null to un-file', async () => {
    const folder = await makeFolder('Folder For Unfile')
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    await getDb().update(formTemplates).set({ folderId: folder.id }).where(eq(formTemplates.id, existing.id))

    const req = new Request(`http://localhost/api/form-templates/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ folderId: null }),
    })
    const res = await putTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    expect(res.status).toBe(200)
    const [row] = await getDb().select().from(formTemplates).where(eq(formTemplates.id, existing.id))
    expect(row.folderId).toBeNull()
  })

  it('PUT rejects a folderId pointing at no folder rather than storing it', async () => {
    const [existing] = await getDb().select().from(formTemplates).limit(1)
    const before = existing.folderId
    const req = new Request(`http://localhost/api/form-templates/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ folderId: 999999999 }),
    })
    const res = await putTemplate(req as never, { params: Promise.resolve({ id: String(existing.id) }) })
    expect(res.status).toBe(400)
    const [row] = await getDb().select().from(formTemplates).where(eq(formTemplates.id, existing.id))
    expect(row.folderId).toBe(before)
  })
})

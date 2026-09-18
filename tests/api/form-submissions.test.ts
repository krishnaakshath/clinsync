import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET, POST } from '@/app/api/form-submissions/route'
import { getDb } from '@/db/client'
import { formTemplates, formSubmissions } from '@/db/schema'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// The seeded template IDs are serial and drift across reseeds of the shared
// dev database, so tests look up a real, currently-valid template ID rather
// than assuming any fixed value.
async function realTemplateId(): Promise<number> {
  const [row] = await getDb().select({ id: formTemplates.id }).from(formTemplates).limit(1)
  if (!row) throw new Error('No seeded form templates found -- run npm run db:seed')
  return row.id
}

describe('GET /api/form-submissions', () => {
  it('returns seeded submissions', async () => {
    const req = new Request('http://localhost/api/form-submissions')
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.length).toBeGreaterThan(0)
  })
})

describe('POST /api/form-submissions', () => {
  // Every successful POST inserts a real row into the shared dev DB -- this
  // test file was previously missing this cleanup entirely, and running the
  // suite repeatedly during a session left 200+ junk "sent" submissions
  // piled onto RD-0001, flooding the Home dashboard's real Latest/Pending
  // Forms widgets with duplicate entries. Track and delete each one created.
  const createdIds: number[] = []
  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!
      await getDb().delete(formSubmissions).where(eq(formSubmissions.id, id))
    }
  })

  it('rejects a payload with an unknown field (mass-assignment guard)', async () => {
    const templateId = await realTemplateId()
    const req = new Request('http://localhost/api/form-submissions', { method: 'POST', body: JSON.stringify({ templateId, patientId: 'RD-0001', status: 'completed' }) })
    const res = await POST(req as never)
    expect(res.status).toBe(400) // 'status' is not in sendFormSchema — new submissions always start 'sent'
  })

  it('generates a unique access token and a 30-day expiry when a form is sent', async () => {
    const templateId = await realTemplateId()
    const req = new Request('http://localhost/api/form-submissions', { method: 'POST', body: JSON.stringify({ templateId, patientId: 'RD-0001' }) })
    const res = await POST(req as never)
    const body = await res.json()
    createdIds.push(body.id)
    expect(body.accessToken).toBeTruthy()
    expect(typeof body.accessToken).toBe('string')
    expect(body.accessToken.length).toBeGreaterThan(30)
    expect(new Date(body.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

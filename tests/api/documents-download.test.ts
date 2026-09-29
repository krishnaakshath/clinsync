import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/documents/[id]/download/route'
import { getDb } from '@/db/client'
import { documents, auditLog } from '@/db/schema'
import { eq } from 'drizzle-orm'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'crc'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: 'Jamie Ruiz' })) }))

const createdDocumentIds: number[] = []

afterEach(async () => {
  sessionRole = 'crc'
  const db = getDb()
  while (createdDocumentIds.length > 0) {
    const id = createdDocumentIds.pop()!
    await db.delete(auditLog).where(eq(auditLog.action, `downloaded document ${id}`))
    await db.delete(documents).where(eq(documents.id, id))
  }
})

async function createThrowawayDocument(overrides: Partial<typeof documents.$inferInsert> = {}) {
  const [row] = await getDb()
    .insert(documents)
    .values({
      name: 'Throwaway Doc.pdf',
      documentDate: '2026-09-29',
      receivedFrom: 'Fax',
      documentType: 'other',
      fileType: 'PDF',
      fileUrl: null,
      patientId: null,
      admissionId: null,
      filedByName: null,
      filedAt: null,
      ...overrides,
    })
    .returning()
  createdDocumentIds.push(row.id)
  return row
}

function downloadReq(id: number) {
  return new Request(`http://localhost/api/documents/${id}/download`)
}

describe('GET /api/documents/[id]/download', () => {
  it('redirects to the fileUrl for a crc', async () => {
    const doc = await createThrowawayDocument({ fileUrl: 'https://blob.test/documents/some-file.pdf' })

    const res = await GET(downloadReq(doc.id) as never, { params: Promise.resolve({ id: String(doc.id) }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://blob.test/documents/some-file.pdf')
  })

  it('redirects to the fileUrl for a pi (download is read access, all four roles)', async () => {
    sessionRole = 'pi'
    const doc = await createThrowawayDocument({ fileUrl: 'https://blob.test/documents/some-file.pdf' })

    const res = await GET(downloadReq(doc.id) as never, { params: Promise.resolve({ id: String(doc.id) }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://blob.test/documents/some-file.pdf')
  })

  it('returns 404 for a metadata-only row with no stored file', async () => {
    const doc = await createThrowawayDocument({ fileUrl: null })

    const res = await GET(downloadReq(doc.id) as never, { params: Promise.resolve({ id: String(doc.id) }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 for a non-existent id', async () => {
    const res = await GET(downloadReq(999999) as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })

  it('writes an audit row on a successful download', async () => {
    const doc = await createThrowawayDocument({ fileUrl: 'https://blob.test/documents/audited.pdf' })

    const res = await GET(downloadReq(doc.id) as never, { params: Promise.resolve({ id: String(doc.id) }) })
    expect(res.status).toBe(302)

    const [row] = await getDb().select().from(auditLog).where(eq(auditLog.action, `downloaded document ${doc.id}`))
    expect(row).toBeDefined()
  })
})

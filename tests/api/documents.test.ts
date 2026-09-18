import { describe, it, expect, vi, afterAll } from 'vitest'
import { PATCH } from '@/app/api/documents/[id]/route'
import { getDb } from '@/db/client'
import { documents } from '@/db/schema'
import { eq } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// This suite mutates a real seeded row (id 3) against the shared dev
// database -- restore its original 'new' status afterward, same pattern as
// Phase 3/5's shared-DB test cleanup, so repeated runs stay idempotent and
// this task's own manual-verification pass isn't left looking at stale data.
afterAll(async () => {
  await getDb().update(documents).set({ status: 'new' }).where(eq(documents.id, 3))
})

describe('PATCH /api/documents/[id]', () => {
  it('rejects an invalid status value', async () => {
    const req = new Request('http://localhost/api/documents/1', { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown field (mass-assignment guard)', async () => {
    const req = new Request('http://localhost/api/documents/1', { method: 'PATCH', body: JSON.stringify({ status: 'processed', name: 'Renamed' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a non-existent document', async () => {
    const req = new Request('http://localhost/api/documents/999999', { method: 'PATCH', body: JSON.stringify({ status: 'processed' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: '999999' }) })
    expect(res.status).toBe(404)
  })

  it('marks a seeded document processed', async () => {
    const req = new Request('http://localhost/api/documents/3', { method: 'PATCH', body: JSON.stringify({ status: 'processed' }) })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: '3' }) })
    expect(res.status).toBe(200)
  })
})

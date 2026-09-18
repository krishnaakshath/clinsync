import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { documents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDocument } from '@/lib/queries/documents'
import { invalidateCache, documentsListCacheKey } from '@/lib/cache'

const updateDocumentSchema = z.object({
  status: z.enum(['new', 'processed']),
}).strict()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params

  const parsed = updateDocumentSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid document update', details: parsed.error.flatten() }, { status: 400 })

  const existing = await getDocument(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await getDb().update(documents).set({ status: parsed.data.status }).where(eq(documents.id, Number(id)))
  await invalidateCache(documentsListCacheKey())
  await logAudit(session, `marked document ${id} as ${parsed.data.status}`, existing.patientId)
  return NextResponse.json({ ok: true })
}

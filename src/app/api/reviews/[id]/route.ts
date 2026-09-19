import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { reviews } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getReview, invalidateReviewsList } from '@/lib/queries/reviews'

const recordResponseSchema = z
  .object({
    ratingOverall: z.number().int().min(1).max(5),
    ratingFormsClarity: z.number().int().min(1).max(5),
    ratingCommunication: z.number().int().min(1).max(5),
    comments: z.string().max(2000).optional(),
  })
  .strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params
  const review = await getReview(Number(id))
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(review)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params

  const parsed = recordResponseSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid survey response payload', details: parsed.error.flatten() }, { status: 400 })

  const existing = await getReview(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'completed') return NextResponse.json({ error: 'This survey response has already been recorded' }, { status: 409 })

  await getDb()
    .update(reviews)
    .set({ ratingOverall: parsed.data.ratingOverall, ratingFormsClarity: parsed.data.ratingFormsClarity, ratingCommunication: parsed.data.ratingCommunication, comments: parsed.data.comments ?? null, status: 'completed', respondedAt: new Date() })
    .where(eq(reviews.id, Number(id)))

  await invalidateReviewsList()
  await logAudit(session, 'recorded pre-screening experience survey response', existing.patientId)
  return NextResponse.json({ ok: true })
}

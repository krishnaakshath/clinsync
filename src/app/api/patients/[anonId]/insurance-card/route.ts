import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { eq } from 'drizzle-orm'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ anonId: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!['admin', 'crc', 'frontdesk'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { anonId } = await params
  const formData = await request.formData()
  const side = formData.get('side')
  const file = formData.get('file')
  if (side !== 'front' && side !== 'back') return NextResponse.json({ error: 'side must be "front" or "back"' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'File must be a JPEG, PNG, or WebP image' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File must be under 8MB' }, { status: 400 })

  const blob = await put(`insurance-cards/${anonId}-primary-${side}-${Date.now()}`, file, { access: 'public' })

  const column = side === 'front' ? { primaryCardFrontUrl: blob.url } : { primaryCardBackUrl: blob.url }
  await getDb().update(patients).set(column).where(eq(patients.id, anonId))

  await logAudit(session, `uploaded insurance card (${side})`, anonId)
  return NextResponse.json({ url: blob.url })
}

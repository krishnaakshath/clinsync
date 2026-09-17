import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { formTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getFormTemplate, invalidateFormTemplatesList } from '@/lib/queries/form-templates'

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  diagnosisTag: z.string().min(1).optional(),
  questions: z.array(z.object({
    id: z.string(), label: z.string(), type: z.enum(['text', 'textarea', 'date', 'select', 'checkbox']),
    options: z.array(z.string()).optional(), hipaaSensitive: z.boolean(), required: z.boolean(),
  })).optional(),
  isActive: z.boolean().optional(),
}).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params
  const template = await getFormTemplate(Number(id))
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const { id } = await params

  const parsed = updateTemplateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template payload', details: parsed.error.flatten() }, { status: 400 })

  await getDb().update(formTemplates).set(parsed.data).where(eq(formTemplates.id, Number(id)))
  await invalidateFormTemplatesList()
  await logAudit(session, `updated form template ${id}`, null)
  return NextResponse.json({ ok: true })
}

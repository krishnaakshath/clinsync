import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody, parseIntParam } from '@/lib/http'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { formTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { canAccessOperations } from '@/lib/role-capabilities'
import { logAudit } from '@/lib/audit'
import { getFormTemplate, invalidateFormTemplatesList, deleteFormTemplate } from '@/lib/queries/form-templates'

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
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const templateId = parseIntParam(id)
  if (templateId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const template = await getFormTemplate(templateId)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const templateId = parseIntParam(id)
  if (templateId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = updateTemplateSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template payload', details: parsed.error.flatten() }, { status: 400 })

  await getDb().update(formTemplates).set(parsed.data).where(eq(formTemplates.id, templateId))
  await invalidateFormTemplatesList()
  await logAudit(session, `updated form template ${id}`, null)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (!canAccessOperations(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const templateId = parseIntParam(id)
  if (templateId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const result = await deleteFormTemplate(templateId)
  if (result === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result === 'in_use') {
    return NextResponse.json({ error: 'This form has already been sent to patients and cannot be deleted. Mark it inactive instead.' }, { status: 409 })
  }
  await logAudit(session, `deleted form template ${id}`, null)
  return NextResponse.json({ ok: true })
}

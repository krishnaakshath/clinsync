import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { formTemplates } from '@/db/schema'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFormTemplates, invalidateFormTemplatesList } from '@/lib/queries/form-templates'

const questionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'date', 'select', 'checkbox']),
  options: z.array(z.string()).optional(),
  optionScores: z.array(z.number().nullable()).optional(),
  hipaaSensitive: z.boolean(),
  required: z.boolean(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  diagnosisTag: z.string().min(1),
  questions: z.array(questionSchema),
  scoringRule: z.object({
    questionIds: z.array(z.string()),
    bands: z.array(z.object({ min: z.number(), max: z.number(), label: z.string() })),
  }).nullable().optional(),
}).strict()

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  await logAudit(session, 'viewed form templates list', null)
  return NextResponse.json(await listFormTemplates())
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const parsed = createTemplateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template payload', details: parsed.error.flatten() }, { status: 400 })

  const [created] = await getDb().insert(formTemplates).values(parsed.data).returning()
  await invalidateFormTemplatesList()
  await logAudit(session, 'created form template', null)
  return NextResponse.json(created, { status: 201 })
}

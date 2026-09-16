import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setSessionCookie } from '@/lib/auth'

const demoLoginSchema = z.object({
  role: z.enum(['crc', 'pi', 'admin']),
  name: z.string().trim().min(1).max(100),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = demoLoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const { role, name } = parsed.data
  await setSessionCookie(role, name)
  return NextResponse.json({ ok: true })
}

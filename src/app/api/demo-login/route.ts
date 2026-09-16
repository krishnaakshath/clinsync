import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie, type Role } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { role, name } = await request.json()
  await setSessionCookie(role as Role, name)
  return NextResponse.json({ ok: true })
}

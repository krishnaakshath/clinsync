import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { searchAll } from '@/lib/queries/search'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const q = new URL(request.url).searchParams.get('q') ?? ''
  return NextResponse.json(await searchAll(q))
}

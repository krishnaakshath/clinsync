import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { listAllTrials } from '@/lib/queries/trials'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const rows = await listAllTrials()
  return NextResponse.json({ trials: rows })
}

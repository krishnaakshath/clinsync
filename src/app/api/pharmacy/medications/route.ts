import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { listMedicationsWithInventory } from '@/lib/queries/medications'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  return NextResponse.json(await listMedicationsWithInventory())
}

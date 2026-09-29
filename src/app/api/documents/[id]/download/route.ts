import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDocument } from '@/lib/queries/documents'

// No role gate: download is read access, same as viewing the document in
// the list -- all four roles can pull the file. The blob URL itself is
// already publicly reachable (same posture as patients.primaryCardFrontUrl,
// rendered as a bare <img src>), so this route's real job isn't gating the
// bytes -- it's producing the audit event that a staff member pulled this
// document.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const existing = await getDocument(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.fileUrl) {
    return NextResponse.json({ error: 'This is a metadata-only record with no stored file' }, { status: 404 })
  }

  await logAudit(session, `downloaded document ${id}`, existing.patientId)

  return NextResponse.redirect(existing.fileUrl, 302)
}

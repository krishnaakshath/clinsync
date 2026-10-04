import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { requireSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getDocument } from '@/lib/queries/documents'

// No role gate: download is read access, same as viewing the document in
// the list -- all four roles can pull the file. The blob store itself is
// private, so this route's job is two-fold: it's the only thing that can
// actually reach the bytes (using our own server-side token), and it's what
// produces the audit event that a staff member pulled this document. Used
// directly as an <img src> for inline thumbnails too (ImagingAttachmentStrip),
// so this streams the bytes rather than redirecting to a blob URL the
// browser could never authenticate to on its own.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  const { id } = await params
  const existing = await getDocument(Number(id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.fileUrl) {
    return NextResponse.json({ error: 'This is a metadata-only record with no stored file' }, { status: 404 })
  }

  const blob = await get(existing.fileUrl, { access: 'private' })
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: 'Stored file is missing' }, { status: 404 })

  await logAudit(session, `downloaded document ${id}`, existing.patientId)

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType,
      'Content-Disposition': `inline; filename="${existing.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}

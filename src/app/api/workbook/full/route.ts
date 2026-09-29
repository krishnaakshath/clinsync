import { NextResponse } from 'next/server'
import { buildFullWorkbookXlsx } from '@/lib/excel-export'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'
import { listWorkbookRows } from '@/lib/queries/workbook'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  // The complete 30-column pre-screening workbook for every patient -- the
  // thing a frontdesk session could download today (spec §3.4.1). Same
  // allowlist as LeftNav.tsx:33's Workbook nav entry.
  if (!['admin', 'crc'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await listWorkbookRows()
  const buffer = await buildFullWorkbookXlsx(rows)
  await logAudit(session, 'exported full 30-column pre-screening workbook', null)

  // See buildWorkbookXlsx's comment in src/lib/excel-export.ts for why this
  // is wrapped in a plain Uint8Array rather than passed as a Node Buffer.
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ipmg-pre-screening-workbook-full.xlsx"',
    },
  })
}

import { NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'
import { buildWorkbookXlsx } from '@/lib/excel-export'
import { logAudit } from '@/lib/audit'
import { requireSession } from '@/lib/auth'

export async function GET() {
  const session = await requireSession()
  if (session instanceof NextResponse) return session

  // Full, unjoined rows (not `listPatientsWithStatus`) so a patient screened
  // against multiple trials appears exactly once in the export, and so every
  // patient field is available regardless of the list view's column subset.
  const rows = await getDb().select().from(patients)
  const buffer = await buildWorkbookXlsx(rows)
  await logAudit(session, 'exported workbook to Excel', null)

  // exceljs's .d.ts declares an ambient global `Buffer extends ArrayBuffer`
  // that conflicts with (and shadows parts of) Node's own `Buffer` type
  // project-wide, which otherwise makes `NextResponse`'s `BodyInit` overload
  // resolution fail here even though a `Buffer` is a perfectly valid body.
  // Passing a plain `Uint8Array` (a type ExcelJS doesn't touch) sidesteps it.
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ipmg-screening-workbook.xlsx"',
    },
  })
}

import ExcelJS from 'exceljs'

const COLUMNS = ['Anonymous Number', 'Patient Name', 'DOB', 'Current Provider', 'Referral Type']

export interface ExportablePatient {
  id: string
  nameTebra: string | null
  dobTebra: string | null
  currentProvider: string | null
  referralType: string | null
}

// Prevents CSV/Excel formula injection: a value starting with =, +, -, @, tab,
// or CR would be interpreted as a formula by Excel/Sheets when the file is
// opened, letting attacker-controlled data (ultimately sourced from IntakeQ
// form submissions in production) execute as a formula on a staff member's
// machine. Prefixing with an apostrophe forces Excel to treat it as literal
// text, matching the standard mitigation for this vulnerability class.
function sanitizeCell(value: string | null): string | null {
  if (value == null) return value
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export async function buildWorkbookXlsx(patients: ExportablePatient[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Screening Workbook')
  sheet.addRow(COLUMNS)
  for (const p of patients) {
    sheet.addRow([p.id, sanitizeCell(p.nameTebra), sanitizeCell(p.dobTebra), sanitizeCell(p.currentProvider), sanitizeCell(p.referralType)])
  }
  // exceljs's own .d.ts declares an ambient global `Buffer extends ArrayBuffer`
  // that conflicts with Node's `Buffer`, so `writeBuffer()`'s declared return
  // type is not directly assignable to Node's `Buffer` (used below as the
  // route handler's response body). Route the value through `Buffer.from`
  // (valid since exceljs's type does extend `ArrayBuffer`) to get a real,
  // correctly-typed Node `Buffer` back out.
  const raw = await workbook.xlsx.writeBuffer()
  return Buffer.from(raw as unknown as ArrayBuffer)
}

import ExcelJS from 'exceljs'

const COLUMNS = ['Anonymous Number', 'Patient Name', 'DOB', 'Current Provider', 'Referral Type']

export interface ExportablePatient {
  id: string
  nameTebra: string | null
  dobTebra: string | null
  currentProvider: string | null
  referralType: string | null
}

export async function buildWorkbookXlsx(patients: ExportablePatient[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Screening Workbook')
  sheet.addRow(COLUMNS)
  for (const p of patients) {
    sheet.addRow([p.id, p.nameTebra, p.dobTebra, p.currentProvider, p.referralType])
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

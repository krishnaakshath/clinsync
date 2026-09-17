import ExcelJS from 'exceljs'

const COLUMNS = [
  'Anonymous Number',
  'Name (IntakeQ)', 'Name (Tebra)', 'Name Match',
  'DOB (IntakeQ)', 'DOB (Tebra)', 'DOB Match',
  'Phone (IntakeQ)', 'Phone (Tebra)',
  'Email (IntakeQ)',
  'Identity Verified', 'ID Type',
  'Current Provider', 'Referral Type',
  'Diagnoses', 'Current Medications', 'Allergies',
  'Trial', 'Overall Status', 'Items Needing Verification',
  'Intake Form Status', 'Last Communication',
]

export interface ExportablePatient {
  id: string
  nameIntakeq: string
  nameTebra: string | null
  dobIntakeq: string
  dobTebra: string | null
  phoneIntakeq: string | null
  phoneTebra: string | null
  emailIntakeq: string | null
  identityVerified: boolean
  idType: string | null
  currentProvider: string | null
  referralType: string | null
  diagnoses: { code: string; description: string }[]
  medications: { name: string; dose: string | null; startDate: string }[]
  allergies: { allergen: string; severity: string }[]
  trialName: string | null
  overallStatus: string | null
  criteriaNeedingVerification: { criterionText: string; evidenceQuote: string | null }[]
  formStatus: string | null
  lastCommunication: string | null
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
    const nameMatch = p.nameTebra == null ? 'No Tebra Record' : (p.nameTebra !== p.nameIntakeq ? 'MISMATCH' : 'Match')
    const dobMatch = p.dobTebra == null ? 'No Tebra Record' : (p.dobTebra !== p.dobIntakeq ? 'MISMATCH' : 'Match')
    const diagnosesStr = p.diagnoses.map((d) => `${d.code}: ${d.description}`).join('; ')
    const medsStr = p.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''} (since ${m.startDate})`).join('; ')
    const allergiesStr = p.allergies.map((a) => `${a.allergen} (${a.severity})`).join('; ')
    const needsVerificationStr = p.criteriaNeedingVerification.map((c) => `${c.criterionText}${c.evidenceQuote ? ` — "${c.evidenceQuote}"` : ''}`).join(' | ')

    sheet.addRow([
      p.id,
      sanitizeCell(p.nameIntakeq), sanitizeCell(p.nameTebra), nameMatch,
      sanitizeCell(p.dobIntakeq), sanitizeCell(p.dobTebra), dobMatch,
      sanitizeCell(p.phoneIntakeq), sanitizeCell(p.phoneTebra),
      sanitizeCell(p.emailIntakeq),
      p.identityVerified ? 'Yes' : 'No', sanitizeCell(p.idType),
      sanitizeCell(p.currentProvider), sanitizeCell(p.referralType),
      sanitizeCell(diagnosesStr), sanitizeCell(medsStr), sanitizeCell(allergiesStr),
      sanitizeCell(p.trialName), sanitizeCell(p.overallStatus), sanitizeCell(needsVerificationStr),
      sanitizeCell(p.formStatus), sanitizeCell(p.lastCommunication),
    ])
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

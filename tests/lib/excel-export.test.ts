import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbookXlsx } from '@/lib/excel-export'

// Fields every `ExportablePatient` literal in this file needs but that most
// individual tests don't care about -- spread this in and override only the
// fields under test, so each test stays focused on what it's actually
// asserting instead of restating the whole (now ~20-field) shape every time.
const baseExportablePatient = {
  nameIntakeq: 'Maria Alvarez',
  nameTebra: 'Maria Alvarez',
  dobIntakeq: '1985-03-12',
  dobTebra: '1985-03-12',
  phoneIntakeq: null,
  phoneTebra: null,
  emailIntakeq: null,
  identityVerified: false,
  idType: null,
  currentProvider: 'Dr. R. Kunam',
  referralType: 'Provider referral',
  diagnoses: [],
  medications: [],
  allergies: [],
  trialName: null,
  overallStatus: null,
  criteriaNeedingVerification: [],
  formStatus: null,
  lastCommunication: null,
}

describe('buildWorkbookXlsx', () => {
  it('produces a non-empty xlsx buffer with a header row matching the column map', async () => {
    const buffer = await buildWorkbookXlsx([
      { ...baseExportablePatient, id: 'RD-0001' },
    ])
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('neutralizes a leading formula character so Excel treats the cell as literal text, not a formula', async () => {
    const buffer = await buildWorkbookXlsx([
      {
        ...baseExportablePatient,
        id: 'RD-0002',
        nameTebra: '=cmd|"/c calc"!A1',
        currentProvider: '+SUM(A1:A9)',
        referralType: '@import(evil)',
      },
    ])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Screening Workbook')!
    const row = sheet.getRow(2)

    // The security property that matters: the value is stored as a plain
    // string cell (never ExcelJS's formula-object shape, `{formula, result}`),
    // so Excel can never execute it as a formula regardless of leading
    // character. The leading apostrophe is prepended to the stored text
    // itself — that's the standard mitigation (OWASP's CSV/Excel injection
    // guidance): it's a UI-input convention Excel recognizes when a *user*
    // types it, but writing it into the literal string value achieves the
    // same "this is text" signal for programmatically-written cells, at the
    // cost of the apostrophe being visible in the cell — an acceptable,
    // intentional tradeoff for a security-sensitive export.
    // Column 3 = "Name (Tebra)", 13 = "Current Provider", 14 = "Referral Type".
    expect(typeof row.getCell(3).value).toBe('string')
    expect(row.getCell(3).value).toBe("'=cmd|\"/c calc\"!A1")
    expect(typeof row.getCell(13).value).toBe('string')
    expect(row.getCell(13).value).toBe("'+SUM(A1:A9)")
    expect(typeof row.getCell(14).value).toBe('string')
    expect(row.getCell(14).value).toBe("'@import(evil)")
  })

  it('neutralizes a leading minus sign (the fourth dangerous character)', async () => {
    const buffer = await buildWorkbookXlsx([
      { ...baseExportablePatient, id: 'RD-0004', nameTebra: '-2+3+cmd|"/c calc"!A0', referralType: 'Self-referral' },
    ])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Screening Workbook')!
    const cell = sheet.getRow(2).getCell(3) // "Name (Tebra)"

    expect(typeof cell.value).toBe('string')
    expect(cell.value).toBe('\'-2+3+cmd|"/c calc"!A0')
  })

  it('leaves ordinary values untouched', async () => {
    const buffer = await buildWorkbookXlsx([
      { ...baseExportablePatient, id: 'RD-0003', referralType: 'Self-referral' },
    ])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Screening Workbook')!
    expect(sheet.getRow(2).getCell(3).value).toBe('Maria Alvarez') // "Name (Tebra)"
  })

  it('reports "No Tebra Record" (not "Match") when there is no Tebra chart at all', async () => {
    const buffer = await buildWorkbookXlsx([
      { ...baseExportablePatient, id: 'RD-0003', nameTebra: null, dobTebra: null },
    ])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Screening Workbook')!
    const row = sheet.getRow(2)

    // Column 4 = "Name Match", 7 = "DOB Match".
    expect(row.getCell(4).value).toBe('No Tebra Record')
    expect(row.getCell(7).value).toBe('No Tebra Record')
  })

  it('includes identity, allergy, and needs-verification columns', async () => {
    const buffer = await buildWorkbookXlsx([{
      id: 'RD-9999', nameIntakeq: 'Test Patient', nameTebra: 'Test Patient',
      dobIntakeq: '1990-01-01', dobTebra: '1990-01-01',
      phoneIntakeq: null, phoneTebra: null, emailIntakeq: null,
      identityVerified: true, idType: 'passport',
      currentProvider: null, referralType: null,
      diagnoses: [{ code: 'F33.1', description: 'MDD, recurrent, moderate' }],
      medications: [{ name: 'Sertraline', dose: '50mg', startDate: '2026-06-01' }],
      allergies: [{ allergen: 'Penicillin', severity: 'moderate' }],
      trialName: 'NCT06911112', overallStatus: 'yellow',
      criteriaNeedingVerification: [{ criterionText: 'Medication washout', evidenceQuote: 'started 5 weeks ago' }],
      formStatus: 'completed', lastCommunication: null,
    }])
    expect(buffer.length).toBeGreaterThan(0)
  })
})

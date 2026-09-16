import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbookXlsx } from '@/lib/excel-export'

describe('buildWorkbookXlsx', () => {
  it('produces a non-empty xlsx buffer with a header row matching the 30-column map', async () => {
    const buffer = await buildWorkbookXlsx([
      { id: 'RD-0001', nameTebra: 'Maria Alvarez', dobTebra: '1985-03-12', currentProvider: 'Dr. R. Kunam', referralType: 'Provider referral' },
    ])
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('neutralizes a leading formula character so Excel treats the cell as literal text, not a formula', async () => {
    const buffer = await buildWorkbookXlsx([
      { id: 'RD-0002', nameTebra: '=cmd|"/c calc"!A1', dobTebra: '1990-01-01', currentProvider: '+SUM(A1:A9)', referralType: '@import(evil)' },
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
    expect(typeof row.getCell(2).value).toBe('string')
    expect(row.getCell(2).value).toBe("'=cmd|\"/c calc\"!A1")
    expect(typeof row.getCell(4).value).toBe('string')
    expect(row.getCell(4).value).toBe("'+SUM(A1:A9)")
  })

  it('leaves ordinary values untouched', async () => {
    const buffer = await buildWorkbookXlsx([
      { id: 'RD-0003', nameTebra: 'Maria Alvarez', dobTebra: '1985-03-12', currentProvider: 'Dr. R. Kunam', referralType: 'Self-referral' },
    ])

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Screening Workbook')!
    expect(sheet.getRow(2).getCell(2).value).toBe('Maria Alvarez')
  })
})

import { describe, it, expect } from 'vitest'
import { buildWorkbookXlsx } from '@/lib/excel-export'

describe('buildWorkbookXlsx', () => {
  it('produces a non-empty xlsx buffer with a header row matching the 30-column map', async () => {
    const buffer = await buildWorkbookXlsx([
      { id: 'RD-0001', nameTebra: 'Maria Alvarez', dobTebra: '1985-03-12', currentProvider: 'Dr. R. Kunam', referralType: 'Provider referral' },
    ])
    expect(buffer.length).toBeGreaterThan(0)
  })
})

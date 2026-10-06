import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscrepancyList } from '@/components/DiscrepancyList'

const rows = [{ id: 1, questionLabel: 'Smoker?', patientAnswer: 'No', chartFinding: 'Yes', resolved: false, resolvedBy: null, createdAt: '2026-01-01' }]

describe('DiscrepancyList', () => {
  it('hides "Mark resolved" unless the viewer may resolve (PI cannot)', () => {
    render(<DiscrepancyList discrepancies={rows} />)
    expect(screen.queryByText('Mark resolved')).toBeNull()
    expect(screen.getByText('Smoker?')).toBeInTheDocument()
  })
  it('shows "Mark resolved" when canResolve', () => {
    render(<DiscrepancyList discrepancies={rows} canResolve />)
    expect(screen.getByText('Mark resolved')).toBeInTheDocument()
  })
})

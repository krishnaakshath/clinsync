import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPanel, type FilterFieldDef } from '@/components/FilterPanel'

const FIELDS: FilterFieldDef[] = [
  { key: 'patientName', label: 'Patient', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['delivered', 'failed'] },
]

describe('FilterPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<FilterPanel open={false} onClose={vi.fn()} availableFields={FIELDS} activeFilters={[]} onApply={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lets the user search for and add a field, then apply it', () => {
    const onApply = vi.fn()
    render(<FilterPanel open onClose={vi.fn()} availableFields={FIELDS} activeFilters={[]} onApply={onApply} />)

    fireEvent.change(screen.getByPlaceholderText('Add a filter'), { target: { value: 'Patient' } })
    fireEvent.click(screen.getByText('Patient'))

    const input = screen.getByRole('dialog').querySelector('input[type="text"]')!
    fireEvent.change(input, { target: { value: 'RD-0001' } })
    fireEvent.click(screen.getByText('Apply'))

    expect(onApply).toHaveBeenCalledWith([{ fieldKey: 'patientName', operator: 'contains', value: 'RD-0001' }])
  })
})

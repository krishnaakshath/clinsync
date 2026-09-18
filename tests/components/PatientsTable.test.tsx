import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatientsTable, type PatientRow } from '@/components/PatientsTable'

const ROWS: PatientRow[] = [
  { id: 'RD-0001', overallStatus: 'green', nameTebra: 'Maria Alvarez', nameIntakeq: 'Maria Alvarez', dobTebra: '1985-03-12', dobIntakeq: '1985-03-12', currentProvider: 'Dr. R. Kunam', referralType: 'Provider referral', lastCommunication: null },
  { id: 'RD-0002', overallStatus: 'red', nameTebra: 'James Thornton', nameIntakeq: 'James Thornton', dobTebra: '1990-11-02', dobIntakeq: '1990-11-02', currentProvider: 'Dr. R. Kunam', referralType: 'Provider referral', lastCommunication: null },
]

describe('PatientsTable', () => {
  it('shows all rows with no search', () => {
    render(<PatientsTable patients={ROWS} />)
    expect(screen.getByText('Maria Alvarez')).toBeInTheDocument()
    expect(screen.getByText('James Thornton')).toBeInTheDocument()
  })

  it('filters rows by name as the user types', () => {
    render(<PatientsTable patients={ROWS} />)
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'thornton' } })
    expect(screen.queryByText('Maria Alvarez')).not.toBeInTheDocument()
    expect(screen.getByText('James Thornton')).toBeInTheDocument()
  })

  it('filters rows by anon id', () => {
    render(<PatientsTable patients={ROWS} />)
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'RD-0001' } })
    expect(screen.getByText('Maria Alvarez')).toBeInTheDocument()
    expect(screen.queryByText('James Thornton')).not.toBeInTheDocument()
  })

  it('shows a no-match message when nothing filters in', () => {
    render(<PatientsTable patients={ROWS} />)
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'nonexistent' } })
    expect(screen.getByText(/No patients match/)).toBeInTheDocument()
  })

  it('clears the search when Clear is clicked', () => {
    render(<PatientsTable patients={ROWS} />)
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'thornton' } })
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(screen.getByText('Maria Alvarez')).toBeInTheDocument()
  })
})

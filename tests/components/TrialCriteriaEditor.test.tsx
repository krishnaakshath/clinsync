import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TrialCriteriaEditor, type TrialCriteria } from '@/components/TrialCriteriaEditor'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.unstubAllGlobals()
  refresh.mockClear()
})

const INITIAL: TrialCriteria = {
  ageMin: 18,
  ageMax: 65,
  diagnosisCodes: [{ code: 'F33.1', description: 'MDD, recurrent, moderate' }],
  ratingScales: [{ name: 'MADRS', description: 'Depression scale' }],
  minRatingScaleScore: 22,
  exclusionDiagnoses: [{ code: 'F20', description: 'Schizophrenia' }],
  medicationClasses: [{ className: 'SSRI', washoutDays: 56, rule: 'On stable SSRI', ruleType: 'required_stable' }],
}

function open() {
  render(<TrialCriteriaEditor trialId="t1" initial={INITIAL} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit criteria' }))
}

describe('TrialCriteriaEditor', () => {
  it('renders every field with accessible labels once opened', () => {
    open()
    expect(screen.getByLabelText('Minimum age')).toHaveValue(18)
    expect(screen.getByLabelText('Maximum age')).toHaveValue(65)
    expect(screen.getByLabelText('Minimum rating scale score')).toHaveValue(22)
    expect(screen.getByLabelText('diagnosis code 1')).toHaveValue('F33.1')
    expect(screen.getByLabelText('Rating scale name 1')).toHaveValue('MADRS')
    expect(screen.getByLabelText('exclusion diagnosis code 1')).toHaveValue('F20')
    expect(screen.getByLabelText('Medication class name 1')).toHaveValue('SSRI')
  })

  it('blocks save and shows an error when max age is below min age', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    open()
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Maximum age/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks save when a code is empty', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    open()
    fireEvent.change(screen.getByLabelText('diagnosis code 1'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/code and a description/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('PUTs the full payload, then closes and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    open()
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '70' } })
    fireEvent.click(screen.getByLabelText('Add diagnosis'))
    fireEvent.change(screen.getByLabelText('diagnosis code 2'), { target: { value: 'F32.9' } })
    fireEvent.change(screen.getByLabelText('diagnosis description 2'), { target: { value: 'MDD, single' } })
    fireEvent.change(screen.getByLabelText('Minimum rating scale score'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/trials/t1/criteria')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      ...INITIAL,
      ageMax: 70,
      minRatingScaleScore: null,
      diagnosisCodes: [...INITIAL.diagnosisCodes, { code: 'F32.9', description: 'MDD, single' }],
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the server error on 403 and re-enables the button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden — PI or admin only' }) }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden — PI or admin only')
    expect(screen.getByRole('button', { name: 'Save criteria' })).not.toBeDisabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('re-enables the button after a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Network error/)
    expect(screen.getByRole('button', { name: 'Save criteria' })).not.toBeDisabled()
  })

  it('closes on Escape and restores focus to the trigger', () => {
    open()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit criteria' })).toHaveFocus()
  })

  it('closes on backdrop click but not on clicks inside the dialog', () => {
    open()
    fireEvent.mouseDown(screen.getByLabelText('Minimum age'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not close on Escape while saving', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Save criteria' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

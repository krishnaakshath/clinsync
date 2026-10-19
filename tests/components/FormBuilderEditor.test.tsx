import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FormBuilderEditor } from '@/components/FormBuilderEditor'

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: mockRouterPush }) }))

afterEach(() => {
  vi.unstubAllGlobals()
  mockRouterPush.mockClear()
})

const BASE_PROPS = {
  templateId: 1,
  initialName: 'Depression Screening',
  initialCategory: 'Screening Questionnaires',
  initialDiagnosisTag: 'Major Depressive Disorder',
  initialIsActive: true,
}

describe('FormBuilderEditor', () => {
  it('does not show an options editor for a text question', () => {
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[{ id: 'q1', label: 'Full name', type: 'text', hipaaSensitive: false, required: true }]} />)
    expect(screen.queryByText('Options')).not.toBeInTheDocument()
  })

  it('shows an options editor with add/remove for a select question', () => {
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[{ id: 'q1', label: 'Severity', type: 'select', options: ['Mild', 'Moderate'], hipaaSensitive: false, required: true }]} />)

    expect(screen.getByText('Options')).toBeInTheDocument()
    expect(screen.getByLabelText('Option 1 for Severity')).toHaveValue('Mild')
    expect(screen.getByLabelText('Option 2 for Severity')).toHaveValue('Moderate')

    fireEvent.click(screen.getByText('+ Add option'))
    expect(screen.getByLabelText('Option 3 for Severity')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Option 3 for Severity'), { target: { value: 'Severe' } })
    expect(screen.getByLabelText('Option 3 for Severity')).toHaveValue('Severe')

    fireEvent.click(screen.getAllByLabelText('Remove option')[0])
    expect(screen.queryByDisplayValue('Mild')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Option 1 for Severity')).toHaveValue('Moderate')
  })

  it('reveals an empty options editor immediately when switching a question to Select', () => {
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[{ id: 'q1', label: 'Notes', type: 'text', hipaaSensitive: false, required: false }]} />)
    fireEvent.change(screen.getByDisplayValue('Text'), { target: { value: 'select' } })
    expect(screen.getByText('No options yet — add at least one so patients have something to choose.')).toBeInTheDocument()
  })

  it('strips blank option rows before saving', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[{ id: 'q1', label: 'Severity', type: 'select', options: ['Mild', ''], hipaaSensitive: false, required: true }]} />)
    fireEvent.click(screen.getByText('Save Form'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.questions[0].options).toEqual(['Mild'])
  })
})

describe('FormBuilderEditor save failure', () => {
  // PUT /api/form-templates/:id returns 400 for e.g. a blank form name (zod
  // min(1)) and 403 for a non-operations role; the editor used to ignore any
  // non-2xx and look exactly like a successful save.
  it('shows the server error when the save is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid template payload' }), { status: 400 })))
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[]} />)
    fireEvent.click(screen.getByText('Save Form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid template payload')
  })

  it('shows a fallback message when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[]} />)
    fireEvent.click(screen.getByText('Save Form'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not/i)
    await waitFor(() => expect(screen.getByText('Save Form')).not.toBeDisabled())
  })
})

describe('FormBuilderEditor delete', () => {
  it('does nothing if the confirm dialog is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[]} />)
    fireEvent.click(screen.getByText('Delete this form template'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('navigates back to the list on a confirmed delete', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[]} />)
    fireEvent.click(screen.getByText('Delete this form template'))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/forms'))
  })

  it('shows the conflict message when the template has already been sent to patients', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This form has already been sent to patients and cannot be deleted. Mark it inactive instead.' }), { status: 409 })))
    render(<FormBuilderEditor {...BASE_PROPS} initialQuestions={[]} />)
    fireEvent.click(screen.getByText('Delete this form template'))
    expect(await screen.findByRole('alert')).toHaveTextContent('already been sent to patients')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

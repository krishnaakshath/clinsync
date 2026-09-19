import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FormBuilderEditor } from '@/components/FormBuilderEditor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const BASE_PROPS = {
  templateId: 1,
  initialName: 'Depression Screening',
  initialCategory: 'Screening Questionnaires',
  initialDiagnosisTag: 'Major Depressive Disorder',
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

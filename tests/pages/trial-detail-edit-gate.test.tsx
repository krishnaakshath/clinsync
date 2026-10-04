import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as auth from '@/lib/auth'
import TrialDetailPage from '@/app/(dashboard)/trials/[trialId]/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: vi.fn(), usePathname: () => '/trials/t1' }))
vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn() }))
vi.mock('@/lib/queries/trial-screenings', () => ({ listScreeningsForTrial: async () => [] }))
vi.mock('@/lib/queries/trials', () => ({
  listAllTrials: async () => [{
    id: 't1', name: 'Trial One', nctNumber: 'NCT1', site: 'Site', studyDrug: 'Drug', condition: 'C',
    ageMin: 18, ageMax: 65, diagnosisCodes: [], ratingScales: [], medicationClasses: [], exclusionDiagnoses: [], minRatingScaleScore: null,
  }],
}))

async function renderAs(role: 'crc' | 'pi' | 'admin') {
  vi.mocked(auth.requireSessionOrRedirect).mockResolvedValue({ role, name: 'X' })
  render(await TrialDetailPage({ params: Promise.resolve({ trialId: 't1' }) }))
}

describe('trial detail "Edit criteria" gate', () => {
  it('hides the button from a coordinator', async () => {
    await renderAs('crc')
    expect(screen.queryByRole('button', { name: 'Edit criteria' })).not.toBeInTheDocument()
  })
  it.each(['pi', 'admin'] as const)('shows the button to %s', async (role) => {
    await renderAs(role)
    expect(screen.getByRole('button', { name: 'Edit criteria' })).toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as auth from '@/lib/auth'
import PatientsPage from '@/app/(dashboard)/patients/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), redirect: vi.fn(), usePathname: () => '/patients' }))
vi.mock('@/lib/auth', () => ({ requireSessionOrRedirect: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/queries/patients', () => ({ listPatientsWithStatus: async () => [] }))
vi.mock('@/lib/queries/trials', () => ({ listAllTrials: async () => [] }))
vi.mock('@/components/PatientsTable', () => ({ PatientsTable: () => null }))

async function renderAs(role: 'crc' | 'pi' | 'admin') {
  vi.mocked(auth.requireSessionOrRedirect).mockResolvedValue({ role, name: 'X' })
  render(await PatientsPage({ searchParams: Promise.resolve({}) }))
}

describe('Patients page Add New Patient button', () => {
  it('is hidden for a PI', async () => {
    await renderAs('pi')
    expect(screen.queryByText('Add New Patient')).toBeNull()
  })
  it.each(['crc', 'admin'] as const)('is shown for %s', async (role) => {
    await renderAs(role)
    expect(screen.getByText('Add New Patient')).toBeInTheDocument()
  })
})

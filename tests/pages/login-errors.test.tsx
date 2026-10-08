import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/LoginBackdrop', () => ({ LoginBackdrop: () => null }))
afterEach(() => vi.unstubAllGlobals())

async function submitStaffLogin() {
  const { default: LoginPage } = await import('@/app/login/page')
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
  fireEvent.submit(screen.getByLabelText('Password').closest('form')!)
}

describe('staff login error messages', () => {
  it('keeps the generic message for wrong credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })))
    await submitStaffLogin()
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
  })

  it('tells the user they are rate limited instead of claiming the password is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many login attempts. Try again in a minute.' }), { status: 429 })))
    await submitStaffLogin()
    expect(await screen.findByText('Too many login attempts. Try again in a minute.')).toBeInTheDocument()
  })

  it('reports a network failure instead of hanging', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await submitStaffLogin()
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
  })
})

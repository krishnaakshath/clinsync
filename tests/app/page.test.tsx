import { describe, it, expect, vi } from 'vitest'
import Page from '@/app/page'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

describe('root page', () => {
  it('redirects to /patients', async () => {
    const { redirect } = await import('next/navigation')
    Page()
    expect(redirect).toHaveBeenCalledWith('/patients')
  })
})

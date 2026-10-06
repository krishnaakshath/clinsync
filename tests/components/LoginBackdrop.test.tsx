// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('@/components/Aurora', () => ({
  default: () => {
    throw new Error('webgl exploded')
  },
}))

import { LoginBackdrop } from '@/components/LoginBackdrop'

afterEach(() => vi.restoreAllMocks())

describe('LoginBackdrop', () => {
  it('shows the CSS aurora when the browser has no WebGL2', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { container } = render(<LoginBackdrop />)
    await waitFor(() => expect(container.querySelector('.login-aurora-css')).not.toBeNull())
  })

  it('falls back to the CSS aurora instead of crashing when the WebGL aurora throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null } as never)
    const { container } = render(<LoginBackdrop />)
    await waitFor(() => expect(container.querySelector('.login-aurora-css')).not.toBeNull())
  })

  it('uses the CSS aurora for visitors who prefer reduced motion', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null } as never)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { container } = render(<LoginBackdrop />)
    await waitFor(() => expect(container.querySelector('.login-aurora-css')).not.toBeNull())
    vi.unstubAllGlobals()
  })
})

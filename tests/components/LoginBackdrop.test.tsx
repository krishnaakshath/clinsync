// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { LoginBackdrop } from '@/components/LoginBackdrop'

afterEach(() => vi.restoreAllMocks())

describe('LoginBackdrop', () => {
  it('renders the grid canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, strokeRect: () => {},
    } as never)
    const { container } = render(<LoginBackdrop />)
    expect(container.querySelector('canvas')).not.toBeNull()
  })

  it('does not crash when no 2D context is available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => render(<LoginBackdrop />)).not.toThrow()
  })
})

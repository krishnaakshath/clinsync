// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// jsdom has no WebGL, and real browsers without it (privacy shields, hardware
// acceleration off) make ogl's Renderer throw while constructing -- the login
// page must still render.
vi.mock('ogl', () => ({
  Renderer: class {
    constructor() {
      throw new TypeError("Cannot set properties of null (setting 'renderer')")
    }
  },
  Program: class {},
  Mesh: class {},
  Color: class {},
  Triangle: class {},
}))

import Aurora from '@/components/Aurora'

describe('Aurora', () => {
  it('renders an empty container instead of crashing when WebGL is unavailable', () => {
    const { container } = render(<Aurora colorStops={['#000000', '#111111', '#222222']} />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.firstElementChild).not.toBeNull()
  })
})

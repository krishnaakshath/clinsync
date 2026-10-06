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

import Iridescence from '@/components/Iridescence'

describe('Iridescence', () => {
  it('renders an empty container instead of crashing when WebGL is unavailable', () => {
    const { container } = render(<Iridescence />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.firstElementChild).not.toBeNull()
  })
})

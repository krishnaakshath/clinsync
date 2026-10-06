'use client'

import { Component, useEffect, useState, type ReactNode } from 'react'
import Aurora from '@/components/Aurora'

// The sign-in backdrop must never be able to take the page down. The WebGL
// Aurora (reactbits.dev) is used where the browser can actually create a
// WebGL2 context; everywhere else (privacy shields, hardware acceleration
// off, remote desktops, headless) -- and for visitors who ask for reduced
// motion -- a pure-CSS aurora of the same palette is shown instead.

const STOPS = ['#3d4f8f', '#2aa6a1', '#c98a4b']

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function CssAurora() {
  return (
    <div className="login-aurora-css" aria-hidden="true">
      <span className="login-aurora-blob login-aurora-blob-a" />
      <span className="login-aurora-blob login-aurora-blob-b" />
      <span className="login-aurora-blob login-aurora-blob-c" />
      <span className="login-aurora-blob login-aurora-blob-d" />
    </div>
  )
}

class WebGLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    // Decorative only: swallow it and show the CSS version.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function LoginBackdrop() {
  // 'pending' renders the CSS version on the server and first paint, so there
  // is never an empty flash and no hydration mismatch.
  const [mode, setMode] = useState<'pending' | 'webgl' | 'css'>('pending')

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability detection needs the browser, so it can only run after mount
    setMode(!reduced && supportsWebGL2() ? 'webgl' : 'css')
  }, [])

  // The CSS aurora is always the base layer (so the page is never plain);
  // the WebGL Aurora is an enhancement drawn over it where it is supported.
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <CssAurora />
      <div className="login-dotgrid" />
      {mode === 'webgl' && (
        <div className="absolute inset-0 opacity-60 mix-blend-multiply">
          <WebGLBoundary fallback={null}>
            <Aurora colorStops={STOPS} amplitude={0.9} blend={0.5} lightMode />
          </WebGLBoundary>
        </div>
      )}
    </div>
  )
}

'use client'

import ShapeGrid from '@/components/ShapeGrid'

// Sign-in backdrop: a single-hue (brand blue on near-white) drifting grid
// from reactbits.dev (ShapeGrid), faded into the page at the edges, with one
// soft blue glow behind the card. It is a plain 2D canvas -- no WebGL -- so
// it cannot fail the way a GPU shader can, and it holds still for visitors
// who prefer reduced motion.
export function LoginBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[oklch(0.985_0.004_250)]" aria-hidden="true">
      <div className="login-glow" />
      <div className="pointer-events-auto absolute inset-0">
        <ShapeGrid
          direction="diagonal"
          speed={0.35}
          squareSize={52}
          borderColor="rgba(61, 79, 143, 0.12)"
          hoverFillColor="rgba(61, 79, 143, 0.09)"
          hoverTrailAmount={4}
          fadeColor="#f7f8fb"
        />
      </div>
    </div>
  )
}

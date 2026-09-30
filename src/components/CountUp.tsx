'use client'
import { useEffect, useRef, useState } from 'react'

// Hand-written (the react-bits registry was timing out repeatedly) -- same
// spirit as react-bits' CountUp: animates a number from 0 to `to` using
// requestAnimationFrame, no new dependency. Ease-out cubic so it settles
// rather than stopping abruptly.
export function CountUp({ to, duration = 800, className }: { to: number; duration?: number; className?: string }) {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  // Re-animate whenever the target value itself changes (e.g. after a
  // router.refresh() following a write), not just on mount.
  const toRef = useRef(to)

  useEffect(() => {
    toRef.current = to
    startRef.current = null
    let frameId: number

    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * toRef.current))
      if (progress < 1) frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [to, duration])

  return <span className={className}>{value}</span>
}

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

function rootBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('design tokens', () => {
  it('no longer uses the old blue primary hue (250) in :root', () => {
    const root = rootBlock('\n:root')
    expect(root).not.toMatch(/--primary:\s*oklch\([^)]*\s250\)/)
  })

  it('uses a near-black, low-chroma primary in :root (the new "ink" primary)', () => {
    const root = rootBlock('\n:root')
    const match = root.match(/--primary:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
    expect(match).not.toBeNull()
    const [, lightness, chroma] = match!.map(Number) as unknown as [number, number, number, number]
    expect(lightness).toBeLessThan(0.3) // near-black, not mid-tone blue
    expect(chroma).toBeLessThan(0.03) // low-chroma neutral, not a saturated hue
  })

  it('keeps success/warning/destructive tokens unchanged from the current values', () => {
    const root = rootBlock('\n:root')
    expect(root).toMatch(/--destructive:\s*oklch\(0\.577\s+0\.245\s+27\.325\)/)
    expect(root).toMatch(/--success:\s*oklch\(0\.596\s+0\.145\s+163\)/)
    expect(root).toMatch(/--warning:\s*oklch\(0\.58\s+0\.15\s+75\)/)
  })
})

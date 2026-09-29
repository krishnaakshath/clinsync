import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { Role } from '@/lib/auth'

// Module-scope mutable role, reset in afterEach -- the vi.mock('@/lib/auth', ...)
// + importActual pattern from tests/api/patients.test.ts:27-29, except the
// mocked role is driven by this variable instead of a fixed literal so a
// single describe block can exercise every role. The `requireSession` mock
// closure below only reads `sessionRole` when the route actually calls it
// (i.e. inside a test), by which point this `let` has long since initialized
// -- vi.mock's factory itself runs at module-link time, but the arrow
// function it returns isn't invoked until later.
let sessionRole: Role = 'crc'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: sessionRole, name: `Test ${sessionRole}` })) }
})

export const ALL_ROLES: Role[] = ['admin', 'crc', 'pi', 'frontdesk']
const DENIED_ROLES = ALL_ROLES.filter((r) => !['admin', 'crc'].includes(r)) // ['pi', 'frontdesk']

afterEach(() => {
  sessionRole = 'crc'
})

import { GET as getWorkbookFull } from '@/app/api/workbook/full/route'
import { GET as getWorkbookExport } from '@/app/api/workbook/export/route'
import { GET as listIdentityMatches } from '@/app/api/identity-matches/route'
import { POST as confirmIdentityMatch } from '@/app/api/identity-matches/[id]/confirm/route'
import { POST as rejectIdentityMatch } from '@/app/api/identity-matches/[id]/reject/route'

describe('GET /api/workbook/full', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of DENIED_ROLES) {
      sessionRole = role
      const res = await getWorkbookFull()
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns the xlsx for admin and crc', async () => {
    for (const role of ['admin', 'crc'] as const) {
      sessionRole = role
      const res = await getWorkbookFull()
      expect(res.status, `role ${role}`).toBe(200)
    }
  })

  // Review Focus #2 — the gate must precede the export, not follow it
  it('does not build the workbook for a denied role', async () => {
    const excelExport = await import('@/lib/excel-export')
    const buildWorkbookSpy = vi.spyOn(excelExport, 'buildFullWorkbookXlsx')
    sessionRole = 'frontdesk'
    const res = await getWorkbookFull()
    expect(res.status).toBe(403)
    expect(buildWorkbookSpy).not.toHaveBeenCalled()
    buildWorkbookSpy.mockRestore()
  })
})

describe('GET /api/workbook/export', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of DENIED_ROLES) {
      sessionRole = role
      const res = await getWorkbookExport()
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns the xlsx for admin and crc', async () => {
    for (const role of ['admin', 'crc'] as const) {
      sessionRole = role
      const res = await getWorkbookExport()
      expect(res.status, `role ${role}`).toBe(200)
    }
  })

  it('does not build the workbook for a denied role', async () => {
    const excelExport = await import('@/lib/excel-export')
    const buildWorkbookSpy = vi.spyOn(excelExport, 'buildWorkbookXlsx')
    sessionRole = 'pi'
    const res = await getWorkbookExport()
    expect(res.status).toBe(403)
    expect(buildWorkbookSpy).not.toHaveBeenCalled()
    buildWorkbookSpy.mockRestore()
  })
})

describe('GET /api/identity-matches', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of DENIED_ROLES) {
      sessionRole = role
      const res = await listIdentityMatches(new NextRequest('http://localhost/api/identity-matches'))
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await listIdentityMatches(new NextRequest('http://localhost/api/identity-matches'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/identity-matches/[id]/confirm', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of DENIED_ROLES) {
      sessionRole = role
      const res = await confirmIdentityMatch(
        new NextRequest('http://localhost/api/identity-matches/999999/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
        { params: Promise.resolve({ id: '999999' }) }
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('reaches the handler for admin', async () => {
    sessionRole = 'admin'
    const res = await confirmIdentityMatch(
      new NextRequest('http://localhost/api/identity-matches/999999/confirm', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('POST /api/identity-matches/[id]/reject', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of DENIED_ROLES) {
      sessionRole = role
      const res = await rejectIdentityMatch(
        new NextRequest('http://localhost/api/identity-matches/999999/reject', { method: 'POST', headers: { accept: 'application/json' } }),
        { params: Promise.resolve({ id: '999999' }) }
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('reaches the handler for admin', async () => {
    sessionRole = 'admin'
    const res = await rejectIdentityMatch(
      new NextRequest('http://localhost/api/identity-matches/999999/reject', { method: 'POST', headers: { accept: 'application/json' } }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(res.status).toBe(404)
  })
})

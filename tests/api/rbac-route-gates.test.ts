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
// Named for the allowlist it's computed against, not just "denied" -- Tasks
// 2 and 4 gate different routes against different allowlists (e.g.
// admin-only billing routes, or admin/crc/frontdesk routes), and a
// generically-named constant here is exactly the kind of thing a future
// author copies without checking, silently testing the wrong roles as
// denied.
const deniedFor = (allowed: Role[]): Role[] => ALL_ROLES.filter((r) => !allowed.includes(r))

afterEach(() => {
  sessionRole = 'crc'
})

import { GET as getWorkbookFull } from '@/app/api/workbook/full/route'
import { GET as getWorkbookExport } from '@/app/api/workbook/export/route'
import { GET as listIdentityMatches } from '@/app/api/identity-matches/route'
import { POST as confirmIdentityMatch } from '@/app/api/identity-matches/[id]/confirm/route'
import { POST as rejectIdentityMatch } from '@/app/api/identity-matches/[id]/reject/route'
import { POST as postMockPayment } from '@/app/api/mock-payments/route'
import { GET as listBroadcasts, POST as postBroadcast } from '@/app/api/broadcasts/route'
import { GET as getBroadcast } from '@/app/api/broadcasts/[id]/route'
import { GET as listBroadcastRecipients } from '@/app/api/broadcasts/recipients/route'
import { GET as listReviews, POST as postReview } from '@/app/api/reviews/route'
import { GET as getReview, PUT as putReview } from '@/app/api/reviews/[id]/route'

describe('GET /api/workbook/full', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
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
    for (const role of deniedFor(['admin', 'crc'])) {
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
    for (const role of deniedFor(['admin', 'crc'])) {
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
    for (const role of deniedFor(['admin', 'crc'])) {
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
    for (const role of deniedFor(['admin', 'crc'])) {
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

describe('POST /api/mock-payments', () => {
  it('403s pi', async () => {
    for (const role of deniedFor(['admin', 'crc', 'frontdesk'])) {
      sessionRole = role
      const res = await postMockPayment(
        new NextRequest('http://localhost/api/mock-payments', { method: 'POST', body: JSON.stringify({}) })
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  // An intentionally invalid (empty) body so an allowed role's response
  // proves it: the gate must let admin/crc/frontdesk through to the route's
  // own Zod validation, which then 400s on the missing fields -- never
  // recording a payment. Anything other than 403 here shows the gate didn't
  // block them; the 400 itself is the route's own concern, not this test's.
  it('does not 403 admin, crc, or frontdesk', async () => {
    for (const role of ['admin', 'crc', 'frontdesk'] as const) {
      sessionRole = role
      const res = await postMockPayment(
        new NextRequest('http://localhost/api/mock-payments', { method: 'POST', body: JSON.stringify({}) })
      )
      expect(res.status, `role ${role}`).not.toBe(403)
    }
  })
})

// LeftNav.tsx:62 — { href: '/broadcasts', roles: ['admin', 'crc'] }
describe('GET /api/broadcasts', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await listBroadcasts()
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await listBroadcasts()
    expect(res.status).toBe(200)
  })
})

// LeftNav.tsx:62 — { href: '/broadcasts', roles: ['admin', 'crc'] }. Nothing
// here sends a real broadcast: an invalid (empty) body proves admin gets past
// the gate to the route's own Zod validation, which then 400s (route.ts:40) --
// never reaching the simulated-delivery insert.
describe('POST /api/broadcasts', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await postBroadcast(
        new NextRequest('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({}) })
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('does not 403 admin', async () => {
    sessionRole = 'admin'
    const res = await postBroadcast(
      new NextRequest('http://localhost/api/broadcasts', { method: 'POST', body: JSON.stringify({}) })
    )
    expect(res.status).toBe(400)
  })
})

// LeftNav.tsx:62 — { href: '/broadcasts', roles: ['admin', 'crc'] }
describe('GET /api/broadcasts/[id]', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await getBroadcast(
        new NextRequest('http://localhost/api/broadcasts/999999'),
        { params: Promise.resolve({ id: '999999' }) }
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await getBroadcast(
      new NextRequest('http://localhost/api/broadcasts/999999'),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(res.status).toBe(200)
  })
})

// LeftNav.tsx:62 — { href: '/broadcasts', roles: ['admin', 'crc'] }
describe('GET /api/broadcasts/recipients', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await listBroadcastRecipients(new NextRequest('http://localhost/api/broadcasts/recipients'))
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await listBroadcastRecipients(new NextRequest('http://localhost/api/broadcasts/recipients'))
    expect(res.status).toBe(200)
  })
})

// LeftNav.tsx:63 — { href: '/experience-surveys', roles: ['admin', 'crc'] }
describe('GET /api/reviews', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await listReviews(new NextRequest('http://localhost/api/reviews'))
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await listReviews(new NextRequest('http://localhost/api/reviews'))
    expect(res.status).toBe(200)
  })
})

// LeftNav.tsx:63 — { href: '/experience-surveys', roles: ['admin', 'crc'] }.
// An invalid (empty) body proves admin gets past the gate to the route's own
// Zod validation, which then 400s (route.ts:38) -- never recording a survey
// send.
describe('POST /api/reviews', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await postReview(
        new NextRequest('http://localhost/api/reviews', { method: 'POST', body: JSON.stringify({}) })
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('does not 403 admin', async () => {
    sessionRole = 'admin'
    const res = await postReview(
      new NextRequest('http://localhost/api/reviews', { method: 'POST', body: JSON.stringify({}) })
    )
    expect(res.status).toBe(400)
  })
})

// LeftNav.tsx:63 — { href: '/experience-surveys', roles: ['admin', 'crc'] }
describe('GET /api/reviews/[id]', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await getReview(
        new NextRequest('http://localhost/api/reviews/999999'),
        { params: Promise.resolve({ id: '999999' }) }
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('returns 200 for admin', async () => {
    sessionRole = 'admin'
    const res = await getReview(
      new NextRequest('http://localhost/api/reviews/999999'),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(res.status).toBe(200)
  })
})

// LeftNav.tsx:63 — { href: '/experience-surveys', roles: ['admin', 'crc'] }.
// This is staff recording a survey response on behalf of a patient, not a
// patient-facing endpoint (spec §7.2) -- nothing here records a real survey
// response: an invalid (empty) body proves admin gets past the gate to the
// route's own Zod validation, which then 400s (route.ts:35).
describe('PUT /api/reviews/[id]', () => {
  it('403s pi and frontdesk', async () => {
    for (const role of deniedFor(['admin', 'crc'])) {
      sessionRole = role
      const res = await putReview(
        new NextRequest('http://localhost/api/reviews/999999', { method: 'PUT', body: JSON.stringify({}) }),
        { params: Promise.resolve({ id: '999999' }) }
      )
      expect(res.status, `role ${role}`).toBe(403)
    }
  })

  it('does not 403 admin', async () => {
    sessionRole = 'admin'
    const res = await putReview(
      new NextRequest('http://localhost/api/reviews/999999', { method: 'PUT', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: '999999' }) }
    )
    expect(res.status).toBe(400)
  })
})

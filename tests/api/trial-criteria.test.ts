import { describe, it, expect, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as auth from '@/lib/auth'
import { PUT } from '@/app/api/trials/[trialId]/criteria/route'

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn() }
})

const call = () =>
  PUT(
    new NextRequest('http://localhost/api/trials/x/criteria', { method: 'PUT', body: JSON.stringify({ ageMin: 18 }) }),
    { params: Promise.resolve({ trialId: 'does-not-exist' }) },
  )

describe('PUT /api/trials/[trialId]/criteria role gate', () => {
  it('returns 401 with no session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await call()).status).toBe(401)
  })

  it('returns 403 for a coordinator', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    expect((await call()).status).toBe(403)
  })
})

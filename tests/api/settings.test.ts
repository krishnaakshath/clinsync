import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import * as auth from '@/lib/auth'
import { getDb } from '@/db/client'
import { appSettings } from '@/db/schema'
import { PUT as updatePracticeInfo } from '@/app/api/settings/practice-info/route'
import { PUT as updateEhrConnections } from '@/app/api/settings/ehr-connections/route'
import { getSettingsSummary, getAppSettings } from '@/lib/queries/settings'

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, requireSession: vi.fn(async () => ({ role: 'admin' as const, name: 'Test Admin' })) }
})

// This is the single shared app_settings row the real Settings page reads --
// every write test below mutates it for real. Snapshot and restore it so a
// test run doesn't leave "IPMG Test" / fake Tebra credentials on screen for
// whoever opens the app next.
let originalSettings: Awaited<ReturnType<typeof getAppSettings>>
beforeAll(async () => {
  originalSettings = await getAppSettings()
})
afterAll(async () => {
  await getDb().update(appSettings).set({
    practiceName: originalSettings.practiceName,
    practiceSite: originalSettings.practiceSite,
    practiceTimezone: originalSettings.practiceTimezone,
    intakeqApiKeyEncrypted: originalSettings.intakeqApiKeyEncrypted,
    tebraCustomerKeyEncrypted: originalSettings.tebraCustomerKeyEncrypted,
    tebraUserEncrypted: originalSettings.tebraUserEncrypted,
    tebraPasswordEncrypted: originalSettings.tebraPasswordEncrypted,
  }).where(eq(appSettings.id, originalSettings.id))
})

function req(url: string, body: unknown) {
  return new NextRequest(url, { method: 'PUT', body: JSON.stringify(body) })
}

describe('PUT /api/settings/practice-info', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const res = await updatePracticeInfo(req('http://localhost/api/settings/practice-info', { practiceName: 'x', practiceSite: 'y', practiceTimezone: 'America/Los_Angeles' }))
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'crc', name: 'Test CRC' })
    const res = await updatePracticeInfo(req('http://localhost/api/settings/practice-info', { practiceName: 'x', practiceSite: 'y', practiceTimezone: 'America/Los_Angeles' }))
    expect(res.status).toBe(403)
  })

  it('rejects an incomplete payload', async () => {
    const res = await updatePracticeInfo(req('http://localhost/api/settings/practice-info', { practiceName: 'x' }))
    expect(res.status).toBe(400)
  })

  it('saves practice info and it is reflected in the settings summary', async () => {
    const res = await updatePracticeInfo(req('http://localhost/api/settings/practice-info', { practiceName: 'IPMG Test', practiceSite: 'Redlands, CA', practiceTimezone: 'America/Los_Angeles' }))
    expect(res.status).toBe(200)
    const summary = await getSettingsSummary()
    expect(summary.practiceName).toBe('IPMG Test')
    expect(summary.practiceSite).toBe('Redlands, CA')
  })
})

describe('PUT /api/settings/ehr-connections', () => {
  it('returns 401 when there is no authenticated session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce(UNAUTHORIZED())
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { intakeqApiKey: 'x' }))
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin session', async () => {
    vi.mocked(auth.requireSession).mockResolvedValueOnce({ role: 'pi', name: 'Test PI' })
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { intakeqApiKey: 'x' }))
    expect(res.status).toBe(403)
  })

  it('storing an IntakeQ key marks it configured without ever echoing the key back', async () => {
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { intakeqApiKey: 'test-intakeq-key-12345' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.intakeqConfigured).toBe(true)
    expect(JSON.stringify(body)).not.toContain('test-intakeq-key-12345')
  })

  it('refuses a Tebra save that would leave the connection half-configured, naming what is missing', async () => {
    await getDb().update(appSettings).set({ tebraCustomerKeyEncrypted: null, tebraUserEncrypted: null, tebraPasswordEncrypted: null })
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { tebraCustomerKey: 'ck1234567', tebraUser: 'api@example.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/API password/)
    expect(JSON.stringify(body)).not.toContain('ck1234567')
    expect((await getSettingsSummary()).tebraConfigured).toBe(false)

    const res2 = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { tebraCustomerKey: 'ck1234567', tebraUser: 'api@example.com', tebraPassword: 'pw' }))
    expect(res2.status).toBe(200)
    expect((await res2.json()).tebraConfigured).toBe(true)

    // Once all three are stored, rotating just the password is fine.
    const res3 = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { tebraPassword: 'pw2' }))
    expect(res3.status).toBe(200)
    expect((await res3.json()).tebraConfigured).toBe(true)
  })

  it('rejects malformed credentials with a field-level error and stores nothing', async () => {
    const before = await getAppSettings()
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', { intakeqApiKey: 'short key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fieldErrors.intakeqApiKey).toMatch(/IntakeQ API key/)
    expect((await getAppSettings()).intakeqApiKeyEncrypted).toBe(before.intakeqApiKeyEncrypted)
  })

  it('answers a malformed JSON body with 400, not a 500', async () => {
    const bad = new NextRequest('http://localhost/api/settings/ehr-connections', { method: 'PUT', body: '{not json', headers: { 'content-type': 'application/json' } })
    const res = await updateEhrConnections(bad)
    expect(res.status).toBe(400)
  })

  it('an empty payload leaves existing credentials untouched', async () => {
    const before = await getSettingsSummary()
    const res = await updateEhrConnections(req('http://localhost/api/settings/ehr-connections', {}))
    expect(res.status).toBe(200)
    const after = await getSettingsSummary()
    expect(after.intakeqConfigured).toBe(before.intakeqConfigured)
    expect(after.tebraConfigured).toBe(before.tebraConfigured)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendJson, NETWORK_ERROR_MESSAGE } from '@/lib/send-json'

afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('sendJson', () => {
  it('sends a JSON body with the given method and returns parsed data', async () => {
    const fetchMock = vi.fn(async () => json(201, { id: 7 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await sendJson<{ id: number }>('/api/x', { method: 'POST', body: { a: 1 } })
    expect(r).toEqual({ ok: true, status: 201, data: { id: 7 } })
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' })
  })

  it('omits body and content-type when there is no body', async () => {
    const fetchMock = vi.fn(async () => json(200, []))
    vi.stubGlobal('fetch', fetchMock)
    await sendJson('/api/x', { method: 'DELETE' })
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { method: 'DELETE' })
  })

  it('defaults to GET', async () => {
    const fetchMock = vi.fn(async () => json(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    await sendJson('/api/x')
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { method: 'GET' })
  })

  it('returns the server error string on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: 'Bad thing', fieldErrors: { a: 'x' } })))
    const r = await sendJson('/api/x', { method: 'PUT', body: {}, fallbackError: 'Could not save.' })
    expect(r).toEqual({ ok: false, status: 400, error: 'Bad thing', body: { error: 'Bad thing', fieldErrors: { a: 'x' } } })
  })

  it('falls back when the error response is not JSON or has no error string', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 500 })))
    const r = await sendJson('/api/x', { method: 'POST', fallbackError: 'Could not save.' })
    expect(r).toMatchObject({ ok: false, status: 500, error: 'Could not save.' })
  })

  it('never throws on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const r = await sendJson('/api/x', { method: 'POST' })
    expect(r).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, body: null })
  })

  it('treats an empty 2xx body as null data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    expect(await sendJson('/api/x', { method: 'POST' })).toEqual({ ok: true, status: 204, data: null })
  })
})

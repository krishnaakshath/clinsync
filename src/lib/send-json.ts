// Client-side wrapper around fetch() for this app's JSON API routes.
//
// Never throws: a network failure, a non-2xx status and an unreadable body
// all come back as { ok: false, error } so every caller can show a message
// and reset its busy state. On failure, `error` is the route's own
// `{ error }` string when it sent one (routes return fixed, display-safe
// messages), otherwise the caller's fallback.

export const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.'

export type SendJsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; body: unknown }

export interface SendJsonOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  fallbackError?: string
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function sendJson<T = unknown>(url: string, options: SendJsonOptions = {}): Promise<SendJsonResult<T>> {
  const { method = 'GET', body, fallbackError = 'Something went wrong. Please try again.' } = options
  const init: RequestInit = body === undefined
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, body: null }
  }

  const parsed = await readBody(res)
  if (res.ok) return { ok: true, status: res.status, data: parsed as T }

  const serverError = parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
    ? (parsed as { error: string }).error
    : null
  return { ok: false, status: res.status, error: serverError || fallbackError, body: parsed }
}

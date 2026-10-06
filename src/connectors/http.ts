import { EhrConnectorError, type EhrVendor } from './errors'

// Shared HTTP transport for the real connectors: per-attempt timeout,
// bounded retries with exponential backoff (honouring Retry-After) for
// throttling / transient 5xx / network failures, and error normalization
// that never captures the request (headers and bodies carry credentials).

export interface TransportOptions {
  fetchImpl?: typeof fetch
  /** Per-attempt timeout. Default 15s. */
  timeoutMs?: number
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number
  /** First backoff delay; doubles per retry. Default 500ms. */
  baseDelayMs?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

export interface TransportResponse {
  status: number
  headers: Headers
  body: string
}

export const DEFAULT_TIMEOUT_MS = 15_000
export const DEFAULT_MAX_ATTEMPTS = 3
const MAX_RETRY_AFTER_MS = 30_000

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function retryAfterMs(headers: Headers): number | null {
  const value = headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS)
  return null
}

export interface RequestPolicy {
  /** Status codes worth retrying (e.g. 429, 502-504). */
  retryableStatus: (status: number) => boolean
  /** Called before every attempt (Tebra uses it to enforce call spacing). */
  beforeAttempt?: () => Promise<void>
}

/**
 * Performs the request, retrying per `policy`. Returns the final response
 * (which may still be a non-2xx status -- the caller maps it), or throws an
 * EhrConnectorError of kind `network` / `rate_limited` / `vendor_error` when
 * retries are exhausted.
 */
export async function requestWithRetry(
  vendor: EhrVendor,
  url: string,
  init: RequestInit,
  policy: RequestPolicy,
  opts: TransportOptions = {},
): Promise<TransportResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const baseDelayMs = opts.baseDelayMs ?? 500
  const sleep = opts.sleep ?? realSleep

  let lastFailure: 'network' | 'rate_limited' | 'vendor_error' = 'network'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (policy.beforeAttempt) await policy.beforeAttempt()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    let body: string
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal })
      body = await response.text()
    } catch {
      // Deliberately discard the thrown value: undici/fetch errors can carry
      // request details. Timeouts (AbortError) and connection failures both
      // land here.
      clearTimeout(timer)
      lastFailure = 'network'
      if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1))
      continue
    }
    clearTimeout(timer)

    if (policy.retryableStatus(response.status)) {
      lastFailure = response.status === 429 ? 'rate_limited' : 'vendor_error'
      if (attempt < maxAttempts) {
        await sleep(retryAfterMs(response.headers) ?? baseDelayMs * 2 ** (attempt - 1))
        continue
      }
      break
    }
    return { status: response.status, headers: response.headers, body }
  }
  throw new EhrConnectorError(vendor, lastFailure)
}

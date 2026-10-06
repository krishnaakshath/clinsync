// Normalized, credential-free errors for the IntakeQ/Tebra connectors.
//
// The message of every EhrConnectorError is one of the fixed strings below --
// it is NEVER built from vendor response text, request bodies, URLs or
// credentials. Vendor error messages can echo back request details (a Tebra
// ErrorResponse may name the API user or customer key), so they are dropped
// on the floor rather than redacted-and-forwarded. That makes these messages
// safe to log, return from an API route, and show in the Settings UI.

export type EhrVendor = 'intakeq' | 'tebra'

export type EhrErrorKind =
  | 'not_configured' // no credentials saved for this vendor (or they could not be read)
  | 'auth_failed' // credentials rejected (wrong key / user / password)
  | 'not_authorized' // authenticated, but the API user lacks a permission
  | 'rate_limited' // vendor throttled us and retries were exhausted
  | 'network' // DNS/TLS/connection failure or timeout, after retries
  | 'vendor_error' // vendor returned an error response / SOAP fault / unexpected status
  | 'invalid_response' // response body could not be parsed
  | 'configuration' // vendor account shape Clinsync can't handle automatically

const VENDOR_LABEL: Record<EhrVendor, string> = { intakeq: 'IntakeQ', tebra: 'Tebra' }

export const NOT_CONFIGURED_MESSAGE = 'EHR connections are not configured'

function messageFor(vendor: EhrVendor | null, kind: EhrErrorKind): string {
  const v = vendor ? VENDOR_LABEL[vendor] : 'The EHR system'
  switch (kind) {
    case 'not_configured':
      return vendor ? `${v} is not configured` : NOT_CONFIGURED_MESSAGE
    case 'auth_failed':
      return `${v} rejected the credentials (authentication failed). Re-enter them in Settings → EHR Connections.`
    case 'not_authorized':
      return `${v} accepted the login, but the API user is missing a required permission.`
    case 'rate_limited':
      return `${v} rate limit reached. Try again in a few minutes.`
    case 'network':
      return `Could not reach ${v} (network error or timeout).`
    case 'vendor_error':
      return `${v} returned an error.`
    case 'invalid_response':
      return `${v} returned a response Clinsync could not read.`
    case 'configuration':
      return `${v} account setup needs attention before Clinsync can use it.`
  }
}

export class EhrConnectorError extends Error {
  readonly vendor: EhrVendor | null
  readonly kind: EhrErrorKind

  constructor(vendor: EhrVendor | null, kind: EhrErrorKind, message?: string) {
    // `message` is only ever passed a fixed, Clinsync-authored string -- never
    // anything derived from a vendor response or credential.
    super(message ?? messageFor(vendor, kind))
    this.name = 'EhrConnectorError'
    this.vendor = vendor
    this.kind = kind
  }

  toJSON() {
    return { name: this.name, vendor: this.vendor, kind: this.kind, message: this.message }
  }
}

/** Thrown when a sync (or other connector use) is attempted with nothing usable configured. */
export class EhrNotConfiguredError extends EhrConnectorError {
  constructor(missing: EhrVendor[] = []) {
    const detail = missing.length > 0 ? ` (missing: ${missing.map((m) => VENDOR_LABEL[m]).join(', ')})` : ''
    super(null, 'not_configured', `${NOT_CONFIGURED_MESSAGE}${detail}. An admin can add credentials in Settings → EHR Connections.`)
    this.name = 'EhrNotConfiguredError'
  }
}

/** A message that is always safe to show a user, whatever was thrown. */
export function safeConnectorMessage(err: unknown, vendor: EhrVendor | null = null): string {
  if (err instanceof EhrConnectorError) return err.message
  return vendor ? `${VENDOR_LABEL[vendor]} check failed unexpectedly.` : 'EHR check failed unexpectedly.'
}

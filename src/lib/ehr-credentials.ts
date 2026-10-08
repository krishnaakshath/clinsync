// Input validation for Settings -> EHR Connections, shared by the API route
// (authoritative) and the form (so obvious mistakes are flagged before a
// round trip). Pure: no server-only imports, safe in a Client Component.
//
// A blank field means "keep what is stored" (see updateEhrCredentials), so
// blanks are dropped rather than rejected. Error messages never echo the
// submitted value -- these are credentials.

export interface EhrCredentialsValue {
  intakeqApiKey?: string
  tebraCustomerKey?: string
  tebraUser?: string
  tebraPassword?: string
}
export type EhrCredentialField = keyof EhrCredentialsValue

export type EhrCredentialsValidation =
  | { ok: true; value: EhrCredentialsValue }
  | { ok: false; error: string; fieldErrors: Partial<Record<EhrCredentialField, string>> }

const FIELDS: EhrCredentialField[] = ['intakeqApiKey', 'tebraCustomerKey', 'tebraUser', 'tebraPassword']
const WHITESPACE = /\s/

function checkField(field: EhrCredentialField, value: string): string | null {
  switch (field) {
    case 'intakeqApiKey':
      if (WHITESPACE.test(value) || value.length < 16 || value.length > 256) {
        return 'IntakeQ API key looks incomplete. Paste the full key from IntakeQ (Settings → Integrations → Developer API), with no spaces.'
      }
      return null
    case 'tebraCustomerKey':
      if (WHITESPACE.test(value) || value.length < 6 || value.length > 64) {
        return 'Tebra customer key should be a single code with no spaces (Tebra: Settings → Get Customer Key).'
      }
      return null
    case 'tebraUser':
      if (WHITESPACE.test(value) || value.length > 254) return 'Tebra API user is the Tebra login (usually an email address) and cannot contain spaces.'
      return null
    case 'tebraPassword':
      if (value.length > 256) return 'Tebra API password is too long.'
      return null
  }
}

export function validateEhrCredentialsInput(input: unknown): EhrCredentialsValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Invalid payload', fieldErrors: {} }
  }
  const record = input as Record<string, unknown>
  const unknownKeys = Object.keys(record).filter((k) => !FIELDS.includes(k as EhrCredentialField))
  if (unknownKeys.length > 0) return { ok: false, error: 'Invalid payload', fieldErrors: {} }

  const value: EhrCredentialsValue = {}
  const fieldErrors: Partial<Record<EhrCredentialField, string>> = {}
  for (const field of FIELDS) {
    const raw = record[field]
    if (raw === undefined || raw === null) continue
    if (typeof raw !== 'string') { fieldErrors[field] = 'Must be text.'; continue }
    const trimmed = raw.trim()
    if (!trimmed) continue
    const problem = checkField(field, trimmed)
    if (problem) fieldErrors[field] = problem
    else value[field] = trimmed
  }
  const problems = Object.values(fieldErrors)
  if (problems.length > 0) return { ok: false, error: problems[0]!, fieldErrors }
  return { ok: true, value }
}

const TEBRA_LABELS = { customerKey: 'customer key', user: 'API user', password: 'API password' } as const

/**
 * The Tebra fields that would still be unset after applying `value` on top
 * of what is stored. Tebra authenticates with all three together, so a save
 * that leaves one missing would store an unusable half-configuration that
 * the page can only show as "Not configured". Empty when the save does not
 * touch Tebra.
 */
export function missingTebraFields(
  stored: { customerKey: boolean; user: boolean; password: boolean },
  value: EhrCredentialsValue,
): string[] {
  if (!value.tebraCustomerKey && !value.tebraUser && !value.tebraPassword) return []
  const missing: string[] = []
  if (!stored.customerKey && !value.tebraCustomerKey) missing.push(TEBRA_LABELS.customerKey)
  if (!stored.user && !value.tebraUser) missing.push(TEBRA_LABELS.user)
  if (!stored.password && !value.tebraPassword) missing.push(TEBRA_LABELS.password)
  return missing
}

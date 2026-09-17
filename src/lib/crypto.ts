import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM for genuinely sensitive fields (government ID numbers, etc.) --
// never the `ENC[...]` string-wrapping convention used elsewhere in this
// codebase for internal system identifiers (intakeqClientIdEncrypted,
// tebraPatientIdEncrypted), which are pseudonymous IDs, not PII on the same
// level as a driver's license/passport number and don't warrant the same
// treatment. IDENTITY_ENCRYPTION_KEY must be a 32-byte key, base64-encoded.
function getKey(): Buffer {
  const raw = process.env.IDENTITY_ENCRYPTION_KEY
  if (!raw) throw new Error('IDENTITY_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('IDENTITY_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

// Stores iv + authTag + ciphertext as one colon-delimited base64 string so
// decryption never needs a second column.
export function encryptSensitive(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptSensitive(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}

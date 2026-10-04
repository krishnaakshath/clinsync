import { getDb } from '@/db/client'
import { signatures } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'

export type Signature = typeof signatures.$inferSelect
export type SignableType = 'form_submission' | 'admission_discharge' | 'form_submission_consent'

export interface CreateSignatureInput {
  signableType: SignableType
  signableId: number
  signerTypedName: string
  signerRole: string
  attestationText: string
}

export async function createSignature(input: CreateSignatureInput): Promise<Signature> {
  const [created] = await getDb().insert(signatures).values(input).returning()
  return created
}

export async function getSignaturesForSignable(signableType: SignableType, signableId: number): Promise<Signature[]> {
  return getDb().select().from(signatures)
    .where(and(eq(signatures.signableType, signableType), eq(signatures.signableId, signableId)))
    .orderBy(desc(signatures.signedAt))
}

export async function getLatestSignatureForSignable(signableType: SignableType, signableId: number): Promise<Signature | null> {
  const rows = await getSignaturesForSignable(signableType, signableId)
  return rows[0] ?? null
}

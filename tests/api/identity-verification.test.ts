import { describe, it, expect, vi, afterEach } from 'vitest'
import { PUT } from '@/app/api/patients/[anonId]/identity/route'
import { getDb } from '@/db/client'
import { patients, identityVerifications, auditLog } from '@/db/schema'
import { eq } from 'drizzle-orm'

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: 'crc', name: 'Jamie Ruiz' })) }))

// The positive-path PUT genuinely writes an identity-verification row (it's
// not mocked), so it must never target a real seeded patient like RD-0004 --
// that would fabricate compliance-looking data on a real chart. Use a
// dedicated throwaway patient instead, and clean up both rows afterward.
const TEST_PATIENT_ID = 'RD-9002'

async function cleanup() {
  await getDb().delete(identityVerifications).where(eq(identityVerifications.patientId, TEST_PATIENT_ID))
  await getDb().delete(auditLog).where(eq(auditLog.patientId, TEST_PATIENT_ID))
  await getDb().delete(patients).where(eq(patients.id, TEST_PATIENT_ID))
}

afterEach(cleanup)

describe('PUT /api/patients/[anonId]/identity', () => {
  it('rejects an invalid idType', async () => {
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ idType: 'ssn_card', idNumber: '123' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ anonId: 'RD-0001' }) })
    expect(res.status).toBe(400)
  })

  it('marks identity verified for a valid payload', async () => {
    await cleanup()
    await getDb().insert(patients).values({ id: TEST_PATIENT_ID, intakeqClientIdRef: 'ENC[test]', nameIntakeq: 'Test Patient', dobIntakeq: '1990-01-01' })

    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ idType: 'passport', idNumber: 'P0000001' }) })
    const res = await PUT(req as never, { params: Promise.resolve({ anonId: TEST_PATIENT_ID }) })
    expect(res.status).toBe(200)

    const [row] = await getDb().select().from(identityVerifications).where(eq(identityVerifications.patientId, TEST_PATIENT_ID))
    expect(row.verified).toBe(true)
  })
})
